---
layout: post
title: "[번역] JIT의 함수 인라이너로 인스타그램 서버 최적화"
category: meta engineering
tags:
  - python
  - instagram
  - jit
toc: true
thumbnail: "/img/thumbnails/meta-instagram.png"
---

> 해당 포스트는 Meta Engineering 블로그의 [How the Cinder JIT’s function inliner helps us optimize Instagram](https://engineering.fb.com/2022/05/02/open-source/cinder-jits-instagram/){:target="_blank"} 포스트를 번역한 글입니다.
> 
> 게시일: 2022.05.02

---

# Cinder JIT의 함수 인라이너가 인스타그램을 최적화한 방법

현재 가장 거대한 규모의 Django 웹 서버인 인스타그램을 운영하고 있기 때문에 우리는 파이썬을 최적화하여 운영 어플리케이션의 속도를 높이는 데 관심이 많습니다.
우리 노력의 일환으로 최근 자체적인 파이썬 런타임 [Cinder](https://github.com/facebookincubator/cinder){:target="_blank"}를 오픈소스로 공개하였습니다.
Cinder 내부에는 불멸 객체(Immortal Objects), shadowcode(일종의 캐싱 처리), [Static Python](https://github.com/facebookincubator/cinder#static-python){:target="_blank"}, [Strict Modules](https://github.com/facebookincubator/cinder#strict-modules){:target="_blank"}과 같은 여러 최적화가 포함되어 있습니다.
이번 포스트에서는 JIT(Just-in-Time) 컴파일러와 최근 릴리즈된 [함수 인라이너(Function Inliner)](https://github.com/facebookincubator/cinder/commit/f3c50b3938906149b32c9cd36c3a41f0e898b52d){:target="_blank"}에 초점을 맞추려고 합니다.

이미 Static Python과 shadowcode가 바이트코드 인터프리터 내부에서 작동하고 있지만 소스 코드를 컴파일하는 과정을 건너뛴다면 오버헤드를 더 줄일 여지가 있었습니다.
바이트코드 디스패치(switch/case), 스택 모델(opcode간에 객체를 push/pop 하는 모델), 혹은 파이썬 3.8 이하의 일반적인 인터프리터 등에서 오버헤드가 존재하고 있었는데, 이러한 오버헤드를 줄이기 위해 JIT 컴파일러를 도입했습니다.

## JIT란?

_Note: 만일 파이썬 바이트코드와 JIT를 이미 알고 있다면 [인라이닝의 장점](#인라이닝의-장점) 단락으로 건너뛰셔도 됩니다._

JIT는 함수를 컴파일하여 바이트코드, **CFG**(Control-Flow Graph, 제어 흐름 그래프), **HIR**(High-level Intermediate Representation, 고수준 중간 표현), **SSA**(Static Single Assignment, 정적 단일 할당) **HIR**, **LIR**(Low-level Intermediate Representation, 저수준 중간 표현), **레지스터-할당**(Register-Allocated) **LIR**, 마지막으로 **어셈블리**로 한 단계씩 순차적으로 변환합니다.

바이트코드에서 레지스터 기반 HIR로 변환하는 과정에서 스택 오버헤드가 제거됩니다.
최종 네이티브 코드(Native Code)로 변환하는 과정에서는 디스패치 오버헤드가 제거됩니다.
그리고 타입 추론 같은 여러 컴파일러 패스(Compiler Pass)를 통해 범용적인 코드를 최적화합니다.
그러면 JIT 컴파일러가 아래 두 함수를 어떻게 컴파일하는지 살펴봅시다.

```python
def callee(x):
    return x + 1    
def caller():
    return callee(3)
```

`callee`는 아주 범용적인 함수입니다.
`x`의 타입에 대해서 별도로 정의하지 않았기 때문에 앞으로 진행될 연산 작업을 특정할 수 없습니다.
또한 파이썬 전역 변수 바인딩이 가변적(mutable)이기 때문에 `caller` 함수 내부에서는 호출시마다 매번 전역으로 정의된 `callee`를 확인해야 합니다.
좀 더 상세한 동작 원리를 점검하기 위해 바이트코드를 살펴볼 수 있습니다.

해당 파이썬 코드는 CPython 3.8 환경에서 아래와 같이 컴파일됩니다.

```shell
callee:
            0 LOAD_FAST                0 (x)
            2 LOAD_CONST               1 (1)
            4 BINARY_ADD
            6 RETURN_VALUE

caller:
            0 LOAD_GLOBAL              0 (callee)
            2 LOAD_CONST               1 (3)
            4 CALL_FUNCTION            1
            6 RETURN_VALUE 
```

위 표현식은 `dis` 모듈에 의해 출력된 값입니다.
총 4개의 열로 이루어져 있는데, 첫 번째 열은 각 함수의 바이트코드 offset(0, 2, 4, …)을 의미합니다.
두 번째 열은 opcode에 대한 표현식입니다.
세 번째 열은 opcode에 대한 바이트와이드(byte-wide) 인자이며, 네 번째 열은 opcode 인자에 대해 우리가 읽을 수 있는 표현식을 담고 있습니다.
대부분 과정에서 이러한 값들은 `PyCodeObject` 구조체의 보조 구조에서 판독되며 바이트코드에는 존재하지 않습니다.

바이트코드는 일반적으로 인터프리터에서 실행됩니다.
인터프리터 내부에서 함수 호출 경로는 호출 함수와 호출 사이트 속성을 질의하기 위한 많은 장치를 포함하고 있습니다.
이러한 장치는 인자나 파라미터 개수가 일치하는지, 디폴트값이 채워져 있는지, 함수가 아닌 객체의 `__call__` 메소드 처리, 힙이 호출 프레임을 할당하는지 등을 검증합니다.
해당 작업은 다소 복잡하며 항상 필요한 작업은 아닙니다.
JIT는 컴파일 시점에 추가적인 정보를 알 수 있는데, 불필요하다고 판단되는 경우 앞서 말한 검증 과정을 생략할 수 있습니다.
또한 전역 변수 동적 탐색 과정을 피할 수 있으며, 명령 스트림에 인라인 상수를 적용하거나, [섀도우 프레임(Shadow Frame)](https://github.com/facebookincubator/cinder/blob/1642fffb42a3a5914386d029bc538a79c435d31b/Include/internal/pycore_shadow_frame_struct.h){:target="_blank"}을 사용할 수도 있습니다.
섀도우 프레임은 스택에 할당된 두 개의 워드(word)로 구성되어 있는데, 내부에 포함된 메타 데이터로 `PyFrameObject` 객체를 재구성할 수 있습니다.
이러한 섀도우 프레임은 함수의 시작과 종료 시점에 스택으로 푸시(push), 팝(pop) 작업이 수행됩니다.

JIT가 파이썬 코드를 최적화하기 이전에는 반드시 바이트코드에서 CFG로 변환되는 과정이 필요합니다.
이 과정에서 먼저 기본 블록(Basic Block)의 경계를 찾아 구분해야 합니다.
점프, 반환, `raise` 작업은 블록을 종료시키는데, 즉 하나의 함수는 하나의 블록만 가진다는 의미입니다.
그 후 JIT는 스택 기반 바이트코드에 대해 추상 해석을 진행하여 무한 레지스터 IR로 변환하게 됩니다.

아래는 바이트코드를 곧바로 변환한 초기 HIR입니다.

```shell
# Initial HIR
fun __main__:callee {
  bb 0 {
    v0 = LoadArg<0; "x">
    v0 = CheckVar<"x"> v0
    v1 = LoadConst<MortalLongExact[1]>
    v2 = BinaryOp<Add> v0 v1
    Return v2
  }
}

fun __main__:caller {
  bb 0 {
    v0 = LoadGlobalCached<0; "callee">
    v0 = GuardIs<0xdeadbeef> v0
    v1 = LoadConst<MortalLongExact[3]>
    v2 = VectorCall<1> v0 v1
    Return v2
  }
}
```

여기에는 바이트코드에 존재하지 않는 추가적인 정보를 담고 있습니다.
우선 객체가 명령어에 내장되었으며 모든 포인터는 `0xdeadbeef`로 대치되었습니다.
`LoadConst`는 `MortalLongExact[1]` 타입으로 매개변수화되었으며, 정확히는 `1`이라는 값에 대한 `PyObject*`를 표현하는 타입입니다.
또한 메모리 주소값을 포함한 `GuardIs` 명령어도 새롭게 등장했습니다.
해당 작업은 `LoadGlobalCached` 이후에 자동으로 달리는데, 전역 변수가 자주 변경되지 않는다는 가정하에 이루어집니다.
전역 변수는 보통 모듈 전역 딕셔너리(module-scope dictionary)에 저장되며 이름과 값의 매핑을 통해 접근할 수 있습니다.
만일 매번 딕셔너리에서 불러오는 대신 포인터 비교만 수행한다면 더 빠른 처리가 가능합니다.
만일 비교에 실패한다면 JIT를 빠져나와 본래 방식으로 돌아가면 됩니다.

이러한 표현식은 유용하지만 궁극적으로 원했던 형태는 아닙니다.
HIR에서 최적화 패스(Optimization Pass)를 실행하기 위해 다시 SSA로 변환해야 합니다.


```shell
# SSA HIR
fun __main__:callee {
  bb 0 {
	v3:Object = LoadArg<0; "x">
	v4:Object = CheckVar<"x"> v3
	v5:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
	v6:Object = BinaryOp<Add> v4 v5
	Return v6
  }
}

fun __main__:caller {
  bb 0 {
	v3:OptObject = LoadGlobalCached<0; "callee">
	v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
	v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
	v6:Object = VectorCall<1> v4 v5
	Return v6
  }
}
```

이제 변수 정의 부분에 JIT가 추론한 타입 정보가 추가된 것을 확인할 수 있습니다.
여기서 `LoadConst`는 해당 상수의 타입을 의미하며, `LoadGlobalCached`과 같은 연산은 함수가 컴파일될 시점의 전역 변수 타입을 의미합니다.
JIT는 모듈의 전역 변수가 변하지 않는다고 가정하기 때문에 함수 호출 대상을 추론하고 실행 코드에 직접 주소값을 적용(예시: `MortalFunc[function:0xdeadbeef]`)할 수 있습니다.

SSA 변환 후, JIT는 HIR을 최적화 단계로 넘깁니다.
현재 최적화 과정에서는 `CheckVar`를 제거하고 있는데, 이는 CPython에서 인자가 null이 아님을 보장하기 때문입니다.
하지만 일반적인 이진 연산(`BinaryOp<Add>`)이나 통상적인 함수 호출(`VectorCall<1>`)은 여전히 최적화하지 못한 상태로 남아있습니다.
그 결과물은 아래와 같습니다.

```shell
# Final HIR (without inlining)
fun __main__:callee {
  bb 0 {
    v3:Object = LoadArg<0; "x">
    v5:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v6:Object = BinaryOp<Add> v3 v5
    Return v6
  }
}

fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    v6:Object = VectorCall<1> v4 v5
    Return v6
  }
}
```

보다시피 범용적인 연산은 타입 정보를 알 수 없기 때문에 최적화에 한계가 있습니다.
또한 JIT는 메소드 단위로 컴파일되기 때문에(이는 트레이싱 JIT나 전역 최적화 방식과 대비됩니다.) 타입 정보를 가져오기 어렵습니다. 
타입 정보와 코드 특수화는 함수 내부에서만 이루어집니다.
또한 함수는 실행되기 전에 prefork 단계에서 컴파일됩니다.

그러면, 만약 더 많은 정보를 얻을 수 있다면 어떻게 될까요?

## 인라이닝의 장점

만약 `callee` 내부 내용을 `caller` 함수 안으로 가져올 수만 있다면 `callee` 함수 인자에 대해 많은 정보를 알 수 있습니다.
또한 함수 호출로 인한 오버헤드도 줄일 수 있습니다.
우리가 작성한 코드를 보면 이 정도만 해도 충분해 보입니다.
하지만 코드가 좀 더 복잡해진다면 인라인 캐시 부하를 제거할 수 있으며 네이티브 코드의 호출 규약으로 인한 레지스터 스택 유출도 줄일 수 있습니다.

만일 `callee`를 `caller` 내부에 수기로 옮겨온다고 가정하면 다음과 같이 보일 수 있습니다.

```shell
# Hypothetical inlined HIR
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    # Inlined "callee"
    v13:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v16:Object = BinaryOp<Add> v5 v13
    # End inlined "callee"
    Return v16
  }
}
```

이제 `BinaryOp` 연산에 대해 많은 타입 정보를 알 수 있습니다.
최적화 패스는 이제 `LongBinaryOp`라는 새로운 opcode를 특정할 수 있는데, 해당 opcode는 `int.__add__`를 직접 호출하여 연산을 수행합니다.

```shell
# Hypothetical inlined+optimized HIR
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    # Inlined "callee"
    v13:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v16:LongExact = LongBinaryOp<Add> v5 v13
    # End inlined "callee"
    Return v16
  }
}
```

이를 통해 이진 연산으로 인한 메모리 효율을 더욱 엄밀하게 분석할 수 있습니다.
즉, 어떤 빌트인(built-in) 함수가 호출되는지 정확히 확인할 수 있으며, 혹은 아예 상수 폴딩으로 컴파일 시에 처리할 수도 있습니다. 

```shell
# Hypothetical inlined+optimized HIR II
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    # Inlined "callee"
    v17:MortalLongExact[4] = LoadConst<MortalLongExact[4]>
    # End inlined "callee"
    Return v17
  }
}
```

아주 깔끔한 결과입니다.
하나의 컴파일러 패스가 좀 더 많은 정보를 주입한 덕분에 다른 최적화 패스는 함수 호출을 상수로 단순화할 수 있었습니다.
`callee` 함수가 변경될 여지가 있기 때문에 `LoadGlobalCached` `GuardIs`는 아직 필요하지만, 그렇게 많은 시간이 소요되는 작업은 아닙니다.

지금까지 인라이닝이 어떤 일을 하는지를 살펴보았으니, 이제 Cinder 내부에 어떻게 구현되어 있는지 살펴봅시다.

## 인라인 컴파일러의 작동 방식

다시 원래 최적화된 HIR로 돌아가서 `caller`를 살펴봅시다.
인라이너는 HIR을 수신하는 컴파일러 패스로, 대략 아래와 같습니다:

```shell
# Original HIR, pre-inlining
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    v6:Object = VectorCall<1> v4 v5
    Return v6
  }
}
```

이 과정에서 모든 `VectorCall`을 순회하면서 하며 대상이 명확한 호출을 가져옵니다.
해당 경우에 `v4`는 특정한 함수라는 정보를 알 수 있습니다.
또한, CFG를 순회하면서 구조를 변경하지 않기 위해 모든 호출 지점을 미리 파악해 둡니다.

그리고 각 호출마다 callee가 인라인 될 수 있다면 callee 함수를 caller 내부로 가져옵니다.
만약 파라미터가 일치하지 않는 경우에는 인라인이 불가능할 수 있습니다.
그런 경우에는 아래 과정을 거칩니다.

**1.** Caller의 CFG 내부에서 호출 대상의 HIR을 구성하되 그래프는 별도로 유지합니다.
Caller는 이미 SSA 형태이므로 해당 상태는 유지한 채 callee의 그래프만 별도로 SSA 변환합니다.
SSA를 다시 실행하는 것은 지원하지 않기 때문에, 인라인 후 전체 CFG에 대해 SSA를 실행하는 방식으로는 작동하지 않습니다.
추가적으로, 모든 Return 명령어를 하나의 큰 Return으로 재작성하는데, 이렇게 함으로써 callee가 하나의 진입점과 하나의 종료 지점만 존재하도록 보장합니다.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    v6:Object = VectorCall<1> v4 v5
    Return v6
  }

  # Non-linked callee
  bb 1 {
    v7 = LoadArg<0; "x">
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    Return v10
  }
}
```

**2.** 호출 명령 이후에 호출 명령어를 포함하는 기본 블록(Basic Block)을 분할합니다.
예를 들어 위 예제의 `bb 0`는 아래와 같이 분할됩니다.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    v6:Object = VectorCall<1> v4 v5
  }

  # Non-linked callee
  bb 1 {
    v7 = LoadArg<0; "x">
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    Return v10
  }

  bb 2 {
    Return v6
  }
}
```

**3.** 첫 단계에서 생성했던 callee 그래프에 관리(Bookkeeping) 명령어와 분기(Branch) 명령어를 추가합니다.
인라인 함수에 대해 `BeginInlinedFunction`, `EndInlinedFunction`를 사용하여 앞서 설명했던 섀도우 프레임 push, pop 작업을 수행합니다.
그리고 호출 명령어도 제거합니다.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    Branch<1>
  }

  # Linked callee
  bb 1 (preds 0) {
    v7 = LoadArg<0; "x">
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    Return v10
  }

  bb 2 {
    EndInlinedFunction
    Return v6
  }
}
```

**4.** 더 이상 callee 함수 호출은 없으며, 따라서 전달할 인자도 없습니다. 
이제 callee 입장에서 `LoadArg`는 의미가 없으므로 `Assign`으로 변환이 가능합니다.
또한 앞서 파라미터와 인자 검증을 진행했기 때문에 인자를 담고 있던 레지스터에서 직접 할당합니다.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    Branch<1>
  }

  # Linked callee with rewritten LoadArg
  bb 1 (preds 0) {
    v7 = Assign v5
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    Return v10
  }

  bb 2 {
    EndInlinedFunction
    Return v6
  }
}
```

**5.** 이제 `Return`을 기존 `VectorCall` 명령어 출력에 대한 `Assign`으로 변경합니다.
Callee는 하나의 Return 지점만 가지고 있으며 여러 지점을 합칠 필요가 없기 때문에 호출 명령어의 출력값을 그대로 사용할 수 있습니다.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    Branch<1>
  }

  # Linked callee with rewritten Return
  bb 1 (preds 0) {
    v7 = Assign v5
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    v6 = Assign v10
    Branch<2>
  }

  bb 2 (preds 1) {
    EndInlinedFunction
    Return v6
  }
}
```

**6.** 눈치채셨겠지만 해당 코드는 처음부터 순차적으로 실행되며 분기점이 큰 의미가 없습니다.
`CleanCFG`를 실행하여 불필요한 부분을 정리합니다.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    v7 = Assign v5
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    v6 = Assign v10
    EndInlinedFunction
    Return v6
  }
}
```

**7.** 이제 기존 타입이 정해진 CFG에 타입이 없는 새로운 코드가 추가되었습니다.
또 다른 최적화 패스를 실행하기 위해 한 번 더 타입 추론 작업을 수행하여 타입 정보를 갱신합니다.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    v7:MortalLongExact[3] = Assign v5
    v8:MortalLongExact[3] = CheckVar<"x"> v7
    v9:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v10:Object = BinaryOp<Add> v8 v9
    v6:Object = Assign v10
    EndInlinedFunction
    Return v6
  }
}
```

**8.** 다시 모든 타입이 특정되었으므로 최적화 패스를 실행합니다.
`CopyPropagation`는 불필요한 `Assign`을 정리하고, `Simplify`는 불필요한 `CheckVar`를 정리하며 이렇게 최적화 작업이 마무리됩니다!

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    v9:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v10:LongExact = LongBinaryOp<Add> v5 v9
    EndInlinedFunction
    Return v10
  }
}
```

이렇게 caller 내부에 callee를 인라인 하였지만, 항상 이렇게 깔끔하게 작업 되지만은 않습니다.
여전히 callee가 독립적인 함수로 컴파일될 수도 있습니다.

## 인라인이 까다로운 이유
 
이러한 인라인 작업은 단순히 재미있는 그래프 변환 작업이 아닙니다.
일부 파이썬 API와 프로파일링 도구는 파이썬 스택을 정확하게 살피며 마치 인라이닝이 발생하지 않은 것처럼 간주합니다.

**샘플링 프로파일러(Sampling Profilers)**:
샘플링 스택 프로파일러는 어떤 코드도 실행하지 않으며 현재 실행중인 함수를 포인터를 따라 추적할 수 있어야 합니다.
이는 섀도우 프레임을 활용하면 가능합니다.

**최적화 해제 메타데이터**:
한 함수에서 예외가 발생하거나 인터프리터로 제어권이 넘어가게 되면(최적화 해제), 그 시점에 존재하던 모든 변수와(JIT에 의해 제거되었을 수도 있지만), 라인 위치 등의 정보를 포함한 `PyFrameObject`를 생성해야합니다.
또한 기계어가 파이썬 코드의 어떤 부분을 참조하는지에 대한 정보도 필요합니다.

**코루틴**:
일반적인 함수를 코루틴으로 인라인 하는 작업은 비교적 간단합니다.
함수가 실행 시부터 마지막까지 계속 실행되고 있기 때문에 `Call` 작업을 호출 대상으로 직접 대체할 수 있습니다.
하지만 코루틴은 주기적으로 제어권을 반환해야 하고 호출 시점에 다른 코루틴이나 제너레이터를 생성해야 합니다.
이러한 점 때문에 조금 까다로워집니다.
함수를 코루틴으로 인라인 하는 건 딱히 어려운 일이 아니지만, 코루틴은 일반 함수와 프레임 구조가 살짝 다르고 현재 프레임이 다중 섀도우를 지원하지 않기 때문에 추가적인 작업이 필요합니다.

**인터프리터 외부에서 프레임 생성**:
파이썬에서는 파이썬 개발자와 C extension 개발자 모두 언제든지 파이썬 프레임을 가져올 수 있습니다.
파이썬 개발자는 CPython의 `sys._getframe`을 호출할 수 있고(구현은 되어있지만 권장하지는 않습니다.), C extension이나 표준 라이브러리 개발자는 `PyEval_GetFrame`을 사용할 수 있습니다.
즉 인라인된 함수 내에서 최적화 해제가 발생하지 않더라도 일부 코드에서 프레임 생성을 요청할 수 있습니다.
이 경우, JIT 컴파일된 코드는 섀도우 프레임이 여전히 존재할 것으로 예상하지만, 파이썬 프레임으로 대체된 상황도 처리해야 합니다.

**인라인 할 상황**:
모든 callee를 caller 내부로 인라인 하는 게 항상 최선은 아닙니다.
일부 callee 함수는 아예 실행되지 않을 수도 있으며, 이러한 상황에서의 인라인 작업은 오히려 코드 사이즈만 늘어날 뿐입니다.
만일 호출이 발생하더라도 caller의 코드를 키우기보다 함수 호출을 유지하는 게 더 합리적일 수도 있습니다.
대부분 런타임에서 휴리스틱(Heuristics)과 자체적인 규칙으로 언제 인라인 작업을 진행할지 결정하고 있으며, 이미 수년 동안 많은 사람의 손을 거치며 다양한 워크로드에서 최적화되었습니다.

**타겟의 `__code__`가 변경된다면?**:
파이썬에서는 이런 변화를 감지할 수 있으며, 이러한 상황에서는 JIT 컴파일된 코드를 무시하게 됩니다.
인라인된 함수의 경우, 매 실행마다 변경 여부를 확인하거나(느릴 수 있음) 변경되었다면 새로 생성된 코드를 패치하여 반영해야 합니다.
두 방법 아직 구현되지 않았지만, 구현이 까다롭지는 않습니다.
네이티브(C) extension의 경우, 모듈이 올바르게 잘 작동하고 `PyFunctionObject` 필드 수정 시 잘 알려줄 거라고 믿는 방법밖에 없습니다.

### 의외로 간단한 것들

**callee가 변경된다면?**:
파이썬은 매우 동적인 언어입니다.
변수의 타입은 실행 중에 변경될 수 있으며, 개발자가 다른 모듈의 전역 변수를 덮어쓸 수도 있습니다.
하지만 인라이너는 이런 상황을 신경 쓸 필요가 없습니다.
인라이너는 callee의 상태를 잘 알고 있다는 전제하에 동작합니다.
변수가 변경되었다면 가드(guard) 명령어가 JIT 코드의 무결성을 유지하며, 그렇지 않은 경우 인터프리터에 최적화될 수 없습니다.

## 향후 계획

이제 워크로드 성능의 특성을 분석하고 어떤 함수를 인라인 할지 결정할 휴리스틱의 개발 가능 여부를 확인할 시점입니다.
이를 위해 많은 논문을 읽고 검증해야 합니다.

저희 [GitHub 저장소](https://github.com/facebookincubator/cinder){:target="_blank"}에서 Cinder를 직접 사용해 보세요.
[도커 이미지](https://github.com/facebookincubator/cinder/pkgs/container/cinder){:target="_blank"}도 제공하고 있어서 손쉬운 실행이 가능합니다.

---

<details>
<summary>원문 보기</summary>
<div markdown="1">

# How the Cinder JIT’s function inliner helps us optimize Instagram

Since Instagram runs one of the world’s largest deployments of the Django web framework, we have natural interest in finding ways to optimize Python so we can speed up our production application.
As part of this effort, we’ve recently open-sourced [Cinder](https://github.com/facebookincubator/cinder){:target="_blank"}, our Python runtime that is a fork of CPython.
Cinder includes optimizations like immortal objects, shadowcode (our term for inline caching and quickening), [Static Python](https://github.com/facebookincubator/cinder#static-python){:target="_blank"}, and [Strict Modules](https://github.com/facebookincubator/cinder#strict-modules){:target="_blank"}.
But this blog focuses on the just-in-time (JIT) compiler and its recently released [function inliner](https://github.com/facebookincubator/cinder/commit/f3c50b3938906149b32c9cd36c3a41f0e898b52d){:target="_blank"}.

Even with Static Python and the shadowcode enabled in the bytecode interpreter, there is still some overhead that we can get rid of by compiling to native code.
There is overhead present in the bytecode dispatch (the switch/case), the stack model (pushing and popping to pass objects between opcodes), and also in a very generic interpreter — at least in CPython 3.8.
So we wrote a JIT compiler to remove a lot of this overhead.

## A bit about the JIT

_Note: If you are already familiar with Python bytecode and JITs, you might want to skip down to [Inlining and its benefits](#inlining-and-its-benefits)._

The JIT compiles functions one at a time, translating from bytecode to a control-flow graph (CFG), to high-level intermediate representation (HIR), to static single assignment (SSA) HIR, to low-level intermediate representation (LIR), to register-allocated LIR, to assembly.

Translating from bytecode to a register-based HIR removes the stack overhead.
Translating to native code removes the dispatch overhead.
And several compiler passes, including type inference, specialize the code from its previous generic form.
Let’s walk through how the JIT compiles two Python functions from beginning to end.
Take a look at this Python code example:

```python
def callee(x):
    return x + 1    
def caller():
    return callee(3)
```

`callee` is a very generic function.
It has no idea what the type of `x` is, so it cannot specialize the addition operation.
In `caller`, the lookup for the global `callee` must happen anew every time because in Python global variable bindings are mutable.
To get an idea of what this looks like, we can look at the bytecode.

This Python code gets compiled to the following CPython 3.8 bytecode:

```shell
callee:
            0 LOAD_FAST                0 (x)
            2 LOAD_CONST               1 (1)
            4 BINARY_ADD
            6 RETURN_VALUE

caller:
            0 LOAD_GLOBAL              0 (callee)
            2 LOAD_CONST               1 (3)
            4 CALL_FUNCTION            1
            6 RETURN_VALUE 
```

In this representation, produced by the `dis` module, there are four columns.
The first contains the bytecode offset (0, 2, 4, …) inside each function.
The second contains the human-readable representation of the opcode.
The third contains the byte-wide argument to the opcode.
The fourth contains the human-readable context-aware meaning of the opcode argument.
In most cases, these are read off an auxiliary structure in the `PyCodeObject` struct and are not present in the bytecode.

This bytecode normally gets executed in the interpreter.
In the bytecode interpreter, the function call path involves a lot of machinery to query properties of the callee function and the call site.
This machinery checks that the argument count and parameter count match up, that defaults are filled in, resolves `__call__` methods for nonfunctions, heap allocate a call frame, and more.
This is rather involved and not always necessary.
The JIT often knows some more information at compile time and can elide checks that it knows are unnecessary.
It also can often avoid dynamic lookup for global variables, inline constants into the instruction stream, and use [shadow frames](https://github.com/facebookincubator/cinder/blob/1642fffb42a3a5914386d029bc538a79c435d31b/Include/internal/pycore_shadow_frame_struct.h){:target="_blank"}.
A shadow frame consists of two stack-allocated words containing metadata we can use to reify `PyFrameObject`s.
They are pushed and popped in every function prologue and epilogue.

Before the JIT can optimize this Python code, it must be transformed from bytecode into a control flow graph.
To do this, we first discover basic block boundaries.
Jumps, returns, and `raise` terminate basic blocks, which means that the functions above only have one basic block each.
Then the JIT does abstract interpretation on the stack-based bytecode to turn it into our infinite register IR.

Below is the initial HIR when translated straight off the bytecode:

```shell
# Initial HIR
fun __main__:callee {
  bb 0 {
    v0 = LoadArg<0; "x">
    v0 = CheckVar<"x"> v0
    v1 = LoadConst<MortalLongExact[1]>
    v2 = BinaryOp<Add> v0 v1
    Return v2
  }
}

fun __main__:caller {
  bb 0 {
    v0 = LoadGlobalCached<0; "callee">
    v0 = GuardIs<0xdeadbeef> v0
    v1 = LoadConst<MortalLongExact[3]>
    v2 = VectorCall<1> v0 v1
    Return v2
  }
}
```

It has some additional information not present in the bytecode.
For starters, it has objects embedded into the instructions (with all pointers replaced with `0xdeadbeef`).
`LoadConst` is parameterized by the type `MortalLongExact[1]`, which describes precisely the `PyObject*` for `1`.
It also has this new `GuardIs` instruction, which has an address.
This is automatically inserted after `LoadGlobalCached` and is based on the assumption that globals change infrequently.
Global variables are normally stored in a big module-scope dictionary, mapping global names to values.
Instead of reloading from the dictionary each time, we can do a fast pointer comparison and leave the JIT (deoptimize) if it fails.

This representation is useful but not entirely what we need.
Before we can run our other optimization passes on the HIR, it needs to be converted to SSA.
So we run the SSA pass on it, which also does basic flow typing:

```shell
# SSA HIR
fun __main__:callee {
  bb 0 {
    v3:Object = LoadArg<0; "x">
    v4:Object = CheckVar<"x"> v3
    v5:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v6:Object = BinaryOp<Add> v4 v5
    Return v6
  }
}

fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    v6:Object = VectorCall<1> v4 v5
    Return v6
  }
}
```

You can see that now variable definitions are annotated with the type that the JIT has inferred.
For `LoadConst`, this is the type of the constant.
For other operations like `LoadGlobalCached`, it is the type of the global variable when the function was compiled.
Because of our assumption about the stability of module globals, the JIT can infer function call targets and burn in addresses to generated code (see `MortalFunc[function:0xdeadbeef]` above) after the guard.

After SSA, the JIT will pass the HIR to the optimizer.
Our current set of optimization passes will remove the `CheckVar` (CPython guarantees arguments will not be null), but that’s about it for these two functions.
We can’t optimize away the generic binary operation (`BinaryOp<Add>`) or the generic function call (`VectorCall<1>`).
So we get this:

```shell
# Final HIR (without inlining)
fun __main__:callee {
  bb 0 {
    v3:Object = LoadArg<0; "x">
    v5:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v6:Object = BinaryOp<Add> v3 v5
    Return v6
  }
}

fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    v6:Object = VectorCall<1> v4 v5
    Return v6
  }
}
```

We can’t optimize these generic operations away because we lack type information.
And we lack type information because the JIT is method-at-a-time (as opposed to tracing or some kind of global optimization).
Type information and specialization happen only within a function.
Additionally, functions are compiled prefork, before they are ever run.

But what if we had more information?

## Inlining and its benefits

If we could inline the body of `callee` into `caller`, we would get more information about the argument to `callee`.
It also would remove the function call overhead.
For our code here, that is more than enough.
On other code, it has other benefits, as well, like removing inline cache pressure (monomorphizing caches in callees) and reducing register stack spills due to the native code calling conventions.

If we hypothetically inline `callee` into `caller` manually, it might look something like the following:

```shell
# Hypothetical inlined HIR
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    # Inlined "callee"
    v13:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v16:Object = BinaryOp<Add> v5 v13
    # End inlined "callee"
    Return v16
  }
}
```

Now we have a lot more information about the types to `BinaryOp`.
An optimization pass can now specialize this to an opcode called `LongBinaryOp`, which calls `int.__add__` directly:

```shell
# Hypothetical inlined+optimized HIR
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    # Inlined "callee"
    v13:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v16:LongExact = LongBinaryOp<Add> v5 v13
    # End inlined "callee"
    Return v16
  }
}
```

This lets us reason better about the memory effects of the binary operation:
We know precisely what built-in function it’s calling.
Or — even better — we could constant fold it completely:

```shell
# Hypothetical inlined+optimized HIR II
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    # Inlined "callee"
    v17:MortalLongExact[4] = LoadConst<MortalLongExact[4]>
    # End inlined "callee"
    Return v17
  }
}
```

This is pretty neat.
With one compiler pass adding more information, the other passes reduced our function call to a constant.
For now, we still need the `LoadGlobalCached` and `GuardIs` in case somebody changes the definition of `callee`, but they do not take much time.

Now that we have seen what inlining can do, let’s take a look at the concrete implementation inside Cinder.

## How the inliner compiler pass works

Let’s go back to the original nonhypothetical optimized HIR for `caller`.
The inliner is a compiler pass that will receive HIR, which looks roughly like this:

```shell
# Original HIR, pre-inlining
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    v6:Object = VectorCall<1> v4 v5
    Return v6
  }
}
```

It iterates over all the `VectorCalls` and collects the calls for which the target is known.
In this case, `v4` is known to be a particular `function`.
We collect all the call sites ahead of time so we are not modifying the CFG as we iterate.

Then, for each call, if the callee can be inlined, we inline the callee into the caller.
A function might not be inlinable if, for example, the arguments don’t match the parameters.
This means a couple of separate steps:

**1.** Construct HIR of the target inside the caller’s CFG, but keep the graphs separate.
The caller is already in SSA form, and we need to maintain that invariant, so we SSA-ify the callee’s graph separately.
We don’t support running SSA on a program twice, otherwise we would probably run SSA on the whole CFG post-inline.
We also rewrite all the Return instructions into one big return.
This ensures that we only have one entry point into the callee and one exit from the callee.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    v6:Object = VectorCall<1> v4 v5
    Return v6
  }

  # Non-linked callee
  bb 1 {
    v7 = LoadArg<0; "x">
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    Return v10
  }
}
```

**2.** Split the basic block containing the call instruction after the call instruction.
For example, in our above example, split `bb 0` into:

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    v6:Object = VectorCall<1> v4 v5
  }

  # Non-linked callee
  bb 1 {
    v7 = LoadArg<0; "x">
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    Return v10
  }

  bb 2 {
    Return v6
  }
}
```

**3.** Add bookkeeping instructions and a branch instruction to the callee constructed in step one.
Remember shadow frames?
We use `BeginInlinedFunction` and `EndInlinedFunction` to push and pop shadow frames for inlined functions.
We also remove the call.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    Branch<1>
  }

  # Linked callee
  bb 1 (preds 0) {
    v7 = LoadArg<0; "x">
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    Return v10
  }

  bb 2 {
    EndInlinedFunction
    Return v6
  }
}
```

**4.** Since `LoadArg` does not make sense for the callee — there is no function call anymore, so no more args — rewrite it to an `Assign`.
Since we checked the arguments against the parameters earlier, we assign directly from the register that held the argument.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    Branch<1>
  }

  # Linked callee with rewritten LoadArg
  bb 1 (preds 0) {
    v7 = Assign v5
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    Return v10
  }

  bb 2 {
    EndInlinedFunction
    Return v6
  }
}
```

**5.** Now we rewrite the inlined `Return` to an `Assign` to the output of the original `VectorCall` instruction.
Since we only have one Return point and do not need to join many of them (they have already been joined in the callee), we can reuse the output of the call instruction.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    Branch<1>
  }

  # Linked callee with rewritten Return
  bb 1 (preds 0) {
    v7 = Assign v5
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    v6 = Assign v10
    Branch<2>
  }

  bb 2 (preds 1) {
    EndInlinedFunction
    Return v6
  }
}
```

**6.** You will notice that despite being straight-line code, we have some unnecessary branches.
We run a `CleanCFG` pass to take care of this for us.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    v7 = Assign v5
    v8 = CheckVar<"x"> v7
    v9 = LoadConst<MortalLongExact[1]>
    v10 = BinaryOp<Add> v8 v9
    v6 = Assign v10
    EndInlinedFunction
    Return v6
  }
}
```

**7.** We have now added new untyped code to our typed CFG.
To run other optimization passes, we need to do another round of type inference and reflow the types.

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    v7:MortalLongExact[3] = Assign v5
    v8:MortalLongExact[3] = CheckVar<"x"> v7
    v9:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v10:Object = BinaryOp<Add> v8 v9
    v6:Object = Assign v10
    EndInlinedFunction
    Return v6
  }
}
```

**8.** Now that we once more have fully typed code, we can run more optimization passes.
`CopyPropagation` will take care of the useless `Assign`s, `Simplify` will take care of the unnecessary `CheckVar`, and then we are done!

```shell
fun __main__:caller {
  bb 0 {
    v3:OptObject = LoadGlobalCached<0; "callee">
    v4:MortalFunc[function:0xdeadbeef] = GuardIs<0xdeadbeef> v3
    v5:MortalLongExact[3] = LoadConst<MortalLongExact[3]>
    BeginInlinedFunction
    v9:MortalLongExact[1] = LoadConst<MortalLongExact[1]>
    v10:LongExact = LongBinaryOp<Add> v5 v9
    EndInlinedFunction
    Return v10
  }
}
```

Here we have compiled `callee` in the context of `caller`, but `callee` might not always be inlined into its other callers.
It can still be compiled as a normal standalone function.

## What makes inlining tricky

Inlining is not just all fun and graph transformations.
There are Python APIs and profiling tools that rely on being able to have an accurate view of the Python stack, as if the inlining never happened.

**Sampling profilers:**
We have a sampling stack profiler that cannot run any code and needs to be able to walk a chain of pointers and discover what functions are currently running. We do this with shadow frames.

**Deoptimization metadata:**
When a function raises an exception or otherwise transfers control to the interpreter (deoptimization), it needs to materialize a `PyFrameObject` with all the variables that should have existed at the time (but might have been erased by the JIT), line numbers, etc.
And this needs information about what any given point in the machine code refers back to in the Python code.

**Coroutines:**
Inlining normal functions into coroutines is fine because functions execute by starting at the top and continuing until they are finished.
We can replace a `Call` with its call target.
But coroutines have to yield control every so often and also materialize a `coroutine` or `generator` object when called.
This is a little bit trickier, and we will tackle this in the future.
Inlining functions into coroutines is not exactly tricky, but it is more work because coroutines have a slightly different frame layout and we have not yet modified the frame to support multiple shadow frames.

**Frame materialization outside the interpreter:**
It turns out Python allows both Python programmers and C extension developers to get a Python frame whenever they want.
For Python programmers, CPython exposes (as an implementation detail, not a guarantee, to be fair) `sys._getframe`.
For C extension programmers and standard library developers, `PyEval_GetFrame` is available.
This means that even though there might be no deoptimization events in the middle of an inlined function, some managed or native code might decide to request that a frame be created anyway.
And the JIT-ed code, which otherwise would have expected the shadow frames to still be around, would also have to handle the case where they have been replaced by real Python frames.

**When to inline:**
Inlining every callee into its caller is not necessarily the best move.
Some callees never get called, and inlining them would increase the code size.
Even if they do get called, it may still make more sense to leave the function call than to bloat the caller’s code.
Runtimes often have heuristics and rules about when to inline functions, and people spend years tuning them for different workloads to optimize performance.

**But what if someone changes the target’s __code__?**
We have a hook to detect this from Python code.
In this case, we invalidate the JIT-ed code for that function.
For inlined functions, we can either check that it hasn’t changed before every execution (slow) or react to changes by patching our generated code.
Neither of these exists yet, but they are not so hard to implement.
For native (C) extensions, we have to trust that the extensions are well behaved and will notify us after messing with the `PyFunctionObject` fields.

### Surprisingly not-tricky things

**What if the callee changes?**
Python is a very dynamic language.
Variables can change type over time, programmers can write to global variables in other modules, etc.
But the inliner does not have to deal with this at all.
The inliner starts with the knowledge that the callee is known and works from there.
If the value changes, the guard instruction will maintain the invariant for the native code and deoptimize into the interpreter otherwise.

## Looking forward

It’s time to collect data about the performance characteristics of our workload and figure out whether we can develop good heuristics about what functions to inline.
There are papers to read and evaluate. 

Take a look at our [GitHub repo](https://github.com/facebookincubator/cinder){:target="_blank"}, and play around with Cinder.
We have included a Dockerfile and [prebuilt Docker image](https://github.com/facebookincubator/cinder/pkgs/container/cinder){:target="_blank"} to make this easier.

</div>
</details>

---

References

- [How the Cinder JIT’s function inliner helps us optimize Instagram](https://engineering.fb.com/2022/05/02/open-source/cinder-jits-instagram/){:target="_blank"}
