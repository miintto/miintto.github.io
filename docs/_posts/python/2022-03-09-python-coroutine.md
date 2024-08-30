---
layout: post
title: "[파이썬] 코루틴"
category: python
tags: 
  - python
  - coroutine
  - generator
thumbnail: "/img/thumbnails/python.png"
---

앞서 [**제너레이터**](/docs/python-generator)의 작동 방식을 생각해보면, 호출자가 제너레이터를 호출하면 제너레이터는 `yield`로 선언한 값을 호출자에게 전달하고 다음 호출을 기다리며 대기하게 됩니다.
이를 반대로 생각해보면 호출자에서 제너레이터 내부로 값을 전달하여 나머지 실행을 이어갈 수도 있지 않을까? 그러한 생각에서 나온 게 바로 **코루틴**(coroutine)입니다.

---

# 1. 코루틴이란?

코루틴이란 제너레이터의 일종입니다.
다만 제너레이터와는 달리 호출자가 실행을 컨트롤할 수 있고 코루틴 내부에 데이터를 전송할 수도 있습니다.
호출자는 `send()` 메소드를 이용하여 제너레이터 내부로 값을 전달할 수 있습니다.

코루틴은 기본적으로 다음 4가지 상태를 가집니다.

- **_GEN_CREATED_** : 코루틴 객체가 생성되어 실행을 대기하는 상태
- **_GEN_RUNNING_** : 파이썬 인터프리터에 의해 실행되고 있는 상태
- **_GEN_SUSPENDED_** : `yield` 문에서 다음 호출을 대기하는 상태
- **_GEN_CLOSED_** : 실행이 완료되고 종료된 상태

바로 생성한 코루틴 객체는 아직 기동할(priming) 수 있는 상태가 아닙니다.
한 번 `next()`를 호출하여 기동할 수 있는 상태로 활성화시켜 주어야 호출자로부터 값을 받을 수 있는 상태가 됩니다.

다음 코드를 보면서 기본적인 작동 방식을 알아봅시다.

```python
def coroutine():
    print("Start!")
    a = yield
    print(f"a: {a}")
    b = yield a
    print(f"b: {b}")
    c = yield a + b
    print(f"c: {c}")


co = coroutine()
co
# <generator object coroutine at 0x7febe8082190>

next(co)
# Start!

co.send(10)
# a: 10
# 10

co.send(6)
# b: 6
# 16

co.send(11)
# c: 11
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
# StopIteration
```

<img src="/img/posts/python-coroutine-process.png" style="max-width:540px"/>

기존 제너레이터는 `yield`를 이용하여 호출자로 전송할 값을 선언하였는데, 코루틴이 호출자로부터 받아온 값을 변수로 할당하는 과정에서도 `yield` 가 사용됩니다. 

`next()` 함수로 코루틴이 활성화되면 처음 `yield` 까지 실행되고 호출자로부터 값을 받을 수 있는 상태가 됩니다.
`send()` 메소드를 이용하여 코루틴 내부로 값을 보내면 코루틴은 해당 값을 변수에 할당하고 다음 `yield`까지 실행 후, 다시 다음 호출이 될 때까지 대기합니다.
실행이 종료되면 제너레이터와 마찬가지로 _StopIteration_ 에러를 발생시킵니다.


> 처음 코루틴을 기동시키는 방법으로 `next(co)` 대신 `co.send(None)` 을 실행하여도 무방합니다.

---

# 2. 코루틴 종료 

## 2.1 `close`

경우에 따라 코루틴 내부에 무한 루프를 사용하여 계속 실행되도록 작성할 수도 있습니다.
이러한 코루틴 내부에 계속 값을 전송하면 종료되지 않고 동작하는데, `close()` 메소드를 이용하면 코루틴을 임의로 종료시킬 수 있습니다.

아래에서 정수들을 입력받아 평균을 계산하는 코루틴을 작성하였습니다. 

```python
def averager():
    total, count = 0, 0
    average = None
    while True:
        n = yield average
        total += n
        count += 1
        average = total / count


co = averager()
next(co)

co.send(10)
# 10.0

co.close()

co.send(1)
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
# StopIteration
```

해당 코루틴은 종료 조건 없이 정수를 입력받으면 계속 동작하게 되어있습니다.
하지만 코루틴에 `close()` 메소드를 실행하면 해당 코루틴은 종료되어 _GEN_CLOSED_ 상태가 됩니다.
코루틴이 종료되었기 때문에 내부에 값을 전송해도 StopIteration 예외가 발생합니다.

## 2.2 예외 발생

코루틴을 종료시키기 위해 내부에 강제로 예외를 발생시키는 방법도 있습니다.

```python
co = averager()
next(co)

co.send(10)
# 10.0

co.send(17)
# 13.5

co.send(6)
# 11.0

co.send("CLOSE")
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
#   File "<stdin>", line 7, in averager
# TypeError: unsupported operand type(s) for +=: 'int' and 'str'

co.send(1)
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
# StopIteration
```

정수형만 입력받는 코루틴 내부에 문자열을 집어넣어 강제로 에러를 발생시켰습니다.
마찬가지로 해당 코루틴은 StopIteration 에러를 발생시키며 종료되었습니다.

> 위의 예제에서는 강제로 에러를 발생시키기 위해 *"CLOSE"* 라는 스트링을 사용하였지만 일반적으로 `None`, `Ellipsis`와 같은 파이썬 내장 상수를 전송하여 코루틴 종료라는 행위를 명확히 표기하기도 합니다.

---

# 3. 코루틴에서 예외 처리 - `throw`

`throw()` 메소드를 사용하면 코루틴 내부로 에러를 전달할 수 있습니다.
이를 잘 이용하면 코루틴 내부에서 예외 처리를 함으로써 특정 예외에 대해서는 코루틴이 중단되지 않고 작동되도록 프로그래밍할 수 있습니다.

```python
def averager():
    total, count = 0, 0
    average = None
    while True:
        try:
            n = yield average
            total += n
            count += 1
            average = total / count
        except ZeroDivisionError:
            print("Cannot get average!")


co = averager()
next(co)

co.send(3)

# 3.0

co.throw(ZeroDivisionError)
# Cannot get average!
# 3.0

co.send(9)
# 6.0

co.throw(KeyError)
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
#   File "<stdin>", line 7, in averager
# KeyError

co.send(4)
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
# StopIteration
```

코루틴 내부에서 처리한 ZeroDivisionError 를 던지면 계속 문제없이 작동합니다.
하지만 KeyError 를 던지게 되면 코루틴은 예외를 처리하지 못하고 중단됩니다.

---

# 4. 코루틴에서 `return` 사용법

코루틴이 종료된 경우 `return`을 이용하여 값을 반환하도록 할 수도 있습니다.

```python
def averager():
    total, count = 0, 0
    average = None
    while True:
        n = yield average
        if n is None:
            break
        total += n
        count += 1
        average = total / count
    return average  # 계산한 결과 값 반환
```

제너레이터와 마찬가지로 코루틴이 종료되는 경우 `return` 값이 StopIteration 의 인자로 할당됩니다.
이를 응용하여 코루틴 종료 후 반환하는 값을 변수에 할당하려면 아래와 같은 방법을 사용할 수 있습니다.

```python
co = averager()
next(co)

co.send(10)
# 10.0

co.send(20)
# 15.0

try:
    co.send(None)  # 종료
except StopIteration as e:
    result = e.value

print(result)
# 15.0
```

하지만 이 경우 `yield from` 구문을 이용하면 내부적으로 StopIteration를 처리하기 때문에 추가적으로 exception 처리 없이도 결과값을 가져올 수 있습니다.

---

# 5. `yield from`

앞서 제너레이터 부분에서 `yield from`은 상위 제너레이터와 하위 제너레이터를 연결해주는 역할을 한다고 설명했습니다.
코루틴을 사용하는 경우도 마찬가지로 상위 코루틴 내부의 `yield from`을 이용하여 하위 코루틴을 활성화시키고, 호출자로부터 받은 데이터를 `yield from`으로 설정된 통로를 따라 하위 코루틴으로 전송합니다.

PEP 380에서는 `yield from`의 작동 방식에 대하여 다음과 같이 설명하고 있습니다.

1. 하위 제너레이터가 생성하는 값은 호출자에게 바로 전달됩니다.
2. `send()` 메소드를 통해 상위 제너레이터에게 전달된 데이터는 바로 하위 호출자에게 전달됩니다. 전달하는 값이 `None`인 경우 하위 제너레이터의 `__next__()` 가 실행됩니다. `None`이 아닌 경우에는 하위 제너레이터의 `send()` 메소드가 호출됩니다.
3. 상위 제너레이터에 _GeneratorExit_ 을 제외한 예외를 던지면 해당 예외는 하위 제너레이터의 `throw()`에 전달됩니다.
4. 상위 제너레이터에 _GeneratorExit_ 을 던지거나 `close()` 를 호출하면 하위 제너레이터의 `close()`가 호출됩니다.
5. 하위 제너레이터가 종료된 경우 _StopIteration_ 의 첫 번째 argument 가 `yield from` 표현식의 값이 됩니다.
6. 상위 혹은 하위 제너레이터에서 `return expr`을 사용하는 경우 해당 제너레이터를 빠져나와 _StopIteration(expr)_ 예외가 발생합니다.

이제 `yield from`의 작동 방식을 고려하여 다음과 같이 코루틴을 작성하였습니다.

```python
def averager():
    total, count = 0, 0
    average = None
    while True:
        n = yield average
        if n is None:
            break
        total += n
        count += 1
        average = total / count
    return average


def gather(l: list):
    while True:
        avg = yield from averager()
        l.append(avg)


avg_list = []
g = gather(avg_list)
next(g)

for i in [10, 20]:
    g.send(i)    # gather 로 전송된 값은 그대로 하위 제너레이터로 전송됩니다.
# 10.0
# 15.0

g.send(None)   # 기존 제너레이터는 폐기되고 계산한 결과 값을 반환합니다.
avg_list
# [15.0]

for i in [40, 50, 60]:
    g.send(i)
# 40.0
# 45.0
# 50.0

g.send(None)   # next(g) 를 사용해도 하위 제너레이터를 종료하는 효과를 볼 수 있습니다
avg_list
# [15.0, 50.0]
```

<img src="/img/posts/python-coroutine-yield-from.png" style="max-width:720px"/>

하위 코루틴 `averager`은 `None`을 입력받는 경우 상위 코루틴에게 계산한 평균값을 반환하며 종료됩니다.
상위 코루틴 `gather`은 호출자로부터 받은 값을 하위 코루틴에 전달하며 하위 코루틴이 종료된 경우 반환된 값을 리스트에 추가합니다.
`None` 값을 입력하는게 아닌 `next`를 호출하는것으로도 동일한 효과를 볼 수 있습니다.

---

References

- Luciano Ramalho, Fluent Python: Clear, Concise, and Effective Programming, 강권학, 한빛미디어, 2016-08-12
- [Coroutines and Tasks - Python 3.10.2 documentation](https://docs.python.org/ko/3/library/asyncio-task.html)
- [PEP 380 -- Syntax for Delegating to a Subgenerator](https://www.python.org/dev/peps/pep-0380/)
- [파이썬 제너레이터와 코루틴](https://medium.com/humanscape-tech/185ae5089bc2)
- [파이썬 yield from - 다른 제너레이터에게 위임하기 · Wireframe](https://soooprmx.com/yield-%EB%8B%A4%EB%A5%B8-%EC%A0%9C%EB%84%88%EB%A0%88%EC%9D%B4%ED%84%B0%EC%97%90%EA%B2%8C-%EC%9E%91%EC%97%85%EC%9D%84-%EC%9C%84%EC%9E%84%ED%95%98%EA%B8%B0/)
