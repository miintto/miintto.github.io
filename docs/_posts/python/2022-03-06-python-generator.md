---
layout: post
title: "[파이썬] 제너레이터"
category: python
tags:
  - python
  - generator
thumbnail: "/img/thumbnails/python.png"
---

일반적으로 파이썬에서 반복문을 사용하는 경우 파이썬 리스트에 담아 for 문을 사용해 실행하는 경우가 많습니다.
하지만 만약 반복하는 데이터의 양이 약 10만 개 정도 된다면 해당 데이터를 다 리스트에 집어넣는 건 너무 낭비가 큽니다.
이런 경우 프로그램이 좀 더 효율적으로 동작하도록 generator를 사용할 수 있습니다.

---

# 1. 반복문

## 1.1 Iterable

**Iterable**은 반복 작업이 가능한 python 객체를 말합니다.
내부에 `__iter__` 메소드가 구현되어 있으며, 파이썬 구조체로는 `list`, `str`, `dict` 등의 객체가 해당됩니다.
쉽게 말해서 for 문으로 순차적으로 원소를 가져올 수 있는 객체는 모두 Iterable 객체라고 간주할 수 있습니다.

다음 객체들은 모두 Iterable 입니다.

```python
from collections.abc import Iterable

isinstance("Hello", Iterable)  # str
# True
isinstance([1, 2, 3], Iterable)  # list
# True
isinstance((1, 2, 3), Iterable)  # tuple
# True
isinstance({1, 2, 3}, Iterable)  # set
# True
isinstance({"a": 1, "b": 2}, Iterable)  # dict
# True
isinstance(range(10), Iterable)  # range
# True
```

해당 객체들은 모두 내부에 `__iter__` 메소드가 구현되어 있어서 Iterator 객체를 생성할 수 있습니다.

```python
iter("Hello")
# <str_iterator object at 0x104b37d30>
iter([1, 2, 3])
# <list_iterator object at 0x104b37910>
iter({1, 2, 3})
# <set_iterator object at 0x104b8b8c0>
iter((1, 2, 3))
# <tuple_iterator object at 0x104b37d30>
iter({"a": 1, "b": 2})
#.<dict_keyiterator object at 0x104b9db70>
```

## 1.2 Iterator

**Iterator**는 iterable한 객체로부터 `iter()` 메소드로 생성됩니다. 내부에 `__iter__` 와 `__next__` 모두 구현되어 있어야 합니다.

`__iter__` 메소드를 가지고 있으므로 Iterable 객체와 마찬가지로 값을 차례로 가져올 수 있습니다.
또한 `iter()`의 결과로 다시 Iterator를 반환할 수 있는데 그 반환값은 자기 자신입니다.

```python
a = iter([1, 2, 3, 4, 5])
a
# <list_iterator object at 0x104b64b20>
iter(a)
# <list_iterator object at 0x104b64b20>
```

`__next__` 메소드는 더 이상 반환할 값이 없을 때까지 다음 원소를 반환합니다.
이때 Iterator는 내부적으로 순회하는 위치를 저장하고 있습니다.
반환한 위치를 기억하였다가 다음 호출이 있으면 그다음 값을 반환합니다.
또한 한 번 사용이 끝난 Iterator는 다시 재사용할 수 없습니다.

```python
from collections.abc import Iterable

a = [1, 2, 3]
isinstance(a, Iterable)
# True

it = iter(a)
next(it)
# 1
next(it)
# 2
next(it)
# 3
next(it)
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
# StopIteration
```

더 이상 가져올 값이 존재하지 않으면 _StopIteration_ 예외를 발생시킵니다. 

큰 범위에서 보면 Iterator는 Iterable의 특별한 케이스라고 할 수 있습니다.

```python
issubclass(Iterator, Iterable)
# True
issubclass(Iterable, Iterator)
# False
```

---

# 2. Generator 함수

제너레이터(generator) 함수는 반환 값으로 iterator 객체를 생성하는 함수입니다.
일반적으로 제너레이터라고 부르기도 하지만 제너레이터 함수가 반환하는 제너레이터 이터레이터(generator iterator)와 구분하기 위해서 여기서는 제너레이터 함수로 표기하겠습니다.

보통 `yield`를 포함하고 있는 함수는 모두 제너레이터(generator) 함수입니다.
일반적인 함수에서는 return 으로 결과값을 반환하지만, 제너레이터 함수는 yield를 사용합니다.
next 호출시마다 제너레이터 함수를 실행하여 yield로 선언한 값을 반환하는데 이때 제너레이터 함수는 다음 호출때까지 대기합니다.
다시 next로 제너레이터 함수에 요청이 들어오면 대기하던 제너레이터 함수는 실행을 이어갑니다.

<img src="/img/posts/python-generator-flow.png" style="max-width:480px"/>

제너레이터 함수에 반드시 iteration이 포함되어야 하는 건 아닙니다.
제너레이터 함수 자체가 반복자 인터페이스를 제공하기 때문입니다.
다음 코드를 보며 제너레이터 함수의 작동 과정을 살펴봅시다.

```python
def gen_123():
    print('>>> Start')
    yield 1
    print('>>> Continue')
    yield 2
    print('>>> End')

gen_123
# <function gen_123 at 0x7fa5c021bb80>

gen_123()
# <generator object gen_123 at 0x7fa5c0230120>

g = gen_123()
next(g)
# >>> Start
# 1

next(g)
# >>> Continue
# 2

next(g)
# >>> End
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
# StopIteration
```

제너레이터 함수는 `next` 호출 시마다 yield 로 선언한 값을 함수 밖으로 반환하고 대기합니다.
마지막까지 실행이 완료된 제너레이터 함수는 StopIteration을 발생시킵니다. 

추가적으로 파이썬 버전 3.3부터는 제너레이터 함수에서 return 값을 선언할 수 있습니다.

```python
def gen():
    yield 1
    return 'Returned In Generator!'

g = gen()

next(g)
# 1

next(g)
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
# StopIteration: Returned In Generator!
```

제너레이터의 return은 StopIteration을 발생시키고 반환값은 StopIteration의 에러 메시지로 할당됩니다.

---

# 3. yield from

제너레이터 내부에서 iteration을 하여 값을 반환하는 경우에는 `yield from`을 사용하면 더 간편하게 작성할 수 있습니다.
`yield from`은 iterable 인 객체만 지정할 수 있는데 또 다른 제너레이터를 호출할 수도 있습니다.
이렇게 제너레이터 안에서 또 다른 제너레이터를 호출하는 경우 `yield from`은 외부 제너레이터의 호출자와 내부 제너레이터를 연결하는 통로 역할을 하는데 해당 부분은 **코루틴**파트에서 자세히 다루겠습니다.

다음은 n 보다 작은 짝수를 모두 가져오는 코드입니다. 단순히 `yield from`이 작동하는걸 보여주기 위한 예시라 효율성과는 다소 거리가 멀게 작성되었습니다.

```python
def gen_even(n):
    for i in range(n):
        if i % 2 == 0:
            yield i

def delegate_generator(n):
    yield from gen_even(n)

list(delegate_generator(20))
# [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]
```

상위 제너레이터 `delegate_generator` 에서 하위 제너레이터 `gen_even`을 호출하는 구조입니다.
하위 제너레이터에서 생성한 값을 상위 제너레이터로 전송하고 다시 `delegate_generator` 밖으로 전달됩니다.

---

# 4. Conclusion

제너레이터는 특정 값이 사용될 때까지 계산을 최대한 뒤로 미루는 **lazy evaluation** 방식으로 작동합니다.
선언 즉시 실행되는 것이 아닌 통해 호출될 때마다 연산 작업을 하게 되는데, 이런 방식으로 프로그래밍하는 경우 필요 없는 메모리 할당이 줄어들어 자원을 좀 더 효율적으로 사용할 수 있습니다.

---

Reference

- Luciano Ramalho, Fluent Python: Clear, Concise, and Effective Programming, 강권학, 한빛미디어, 2016-08-12
- [Generators - Python Wiki](https://wiki.python.org/moin/Generators)
- [Glossary - Python 3.10.2 documentation](https://docs.python.org/ko/3/glossary.html#term-generator)
- [파이썬(Python) - 이터레이터(Iterator) 설명 및 예제 소스 코드](https://niceman.tistory.com/136)
- [[Python] Iterable, Iterator 그리고 Generator](https://shoark7.github.io/programming/python/iterable-iterator-generator-in-python)
- [파이썬 코딩 도장](https://dojang.io/mod/page/view.php?id=2412)
- [python generator(제너레이터) 란 무엇인가](https://bluese05.tistory.com/56)
