---
layout: post
title: "[파이썬] 그린 스레드 라이브러리"
date: 2023-04-09
banner: "/img/posts/python-green-thread-banner.png"
---

보편적으로 스레드라고 하면 커널로부터 자원을 할당받아 실행되는 **네이티브 스레드**(native thread)를 먼저 생각하겠지만,
OS에 의존하지 않고 대신 런타임 라이브러리나 가상머신이 스케줄링하는 **그린 스레드**(green thread)도 빈번하게 사용됩니다.
그린 스레드는 커널 공간이 아닌 사용자 공간에서 관리되는데 보통 하나의 네이티브 스레드에서 여러 그린 스레드를 실행하는 방식으로 작동합니다.

그린 스레드의 개념은 Java 진영에서 처음 모습을 드러냈습니다.
Java 1.1 버전에서 그린 스레드가 도입되었지만, 네이티브 스레드와 비교해서 성능적으로 여러 한계를 보여주어 1.3 버전에서는 제거되었습니다.
하지만 그 기본 개념은 Python, Javascript, Go 등 다른 언어에 스며들어 독자적인 동시성 모듈을 발전시켰습니다.

---

# 1. Threading

**`threading`**은 파이썬에서 OS 레벨 스레드를 사용하기 위한 모듈입니다.
스레드를 다루는 저수준 API 모듈 `_thread` 기반으로 작성되었는데, 파이썬 3.7 버전부터는 기본 라이브러리에 내장되었습니다.
파이썬 특성상 GIL에 의해 스레드의 사용이 제한될 수 있지만, C언어로 작성된 파이썬 내장 함수들은 I/O 작업시 결과를 받기 전 까지 GIL을 해제하므로 입출력 작업을 동시에 처리하는 경우라면 여전히 유효할 수 있습니다.

```python
import threading
import requests


def get_request(flag: str):
    res = requests.get(
        url=f"https://www.fluentpython.com/data/flags/{flag.lower()}/{flag.lower()}.gif"
    )
    print(flag, res.status_code)

t1 = threading.Thread(target=get_request, args=("DE",))
t2 = threading.Thread(target=get_request, args=("FR",))
t3 = threading.Thread(target=get_request, args=("KR",))
t1.start()
t2.start()
t3.start()
t1.join()
t2.join()
t3.join()
# FR 200
# KR 200
# DE 200
```

`thread.Thread`는 별도의 스레드에서 프로그램을 실행시키기 위한 클래스입니다.
스레드 객체 생성시 입력한 callable 객체는 `start()` 메소드 호출시 실행됩니다.
`join()` 메소드는 해당 스레드가 작업을 마칠때까지 블록하는 기능을 하는데, 스레드가 종료되지 전 까지 그 다음 코드를 실행할 수 없습니다.
반드시 스레드를 시작한 후에 실행되어야 하며, 내부에 타임아웃 인자를 지정하여 최대 대기 시간을 조정할 수도 있습니다.

# 2. Greenlet

**Greenlet**은 동시성을 위한 경량 코루틴입니다.
기본적인 아이디어는 CPython을 포크하여 만든 stackless 파이썬 프로젝트에서 착안하였는데,
stackless에서 마이크로스레드로 사용하는 tasklet의 개념을 접목시켜서 CPython에서 시스템 스케줄링이 없는 마이크로스레드<i>(쉽게 말해서 코루틴)</i>를 사용할 수 있도록 하였습니다.

어떻게 보면 위에서 설명한 `threading` 모듈과 비슷해 보이겠지만 여러 차이점이 있습니다.
`threading`은 여러 스레드를 이용해 **병렬**로 작업을 처리하는데, 이 과정에서 실행되는 여러 스레드의 순서는 프로그래머가 임의로 컨트롤할 수 없습니다.
또한 싱글 스레드 기반으로 작동하는 파이썬 환경에서 여러 스레드를 사용하는 것은 여러 위험 부담이 따르는데, 반드시 race condition, deadlock 등의 발생 가능성에 대해 충분히 고려해아 합니다.

반면, greenlet은 작업을 병렬이 아닌 **순차적**으로 처리합니다.
즉, 매 순간 실행되고 있는 greenlet은 항상 하나라는 의미인데, 이 과정에서 race condition을 예방할 수 있습니다. 
또한 프로그래머는 여러 greenlet 간에 언제 작동을 멈추고 다른 greenlet으로 넘어가는지에 대한 세세한 과정까지 조정할 수 있습니다.
부가적으로 스레드를 사용하기 위해서는 OS로부터 추가적인 자원을 할당받아야 하지만, greenlet은 이미 할당받은 자원을 이용하여 실행되므로 좀 더 가볍고 효율적입니다.

`greenlet.greenlet` 클래스가 바로 greenlet의 구현체입니다.
초기 greenlet 객체를 생성하면 빈 스택이 만들어지는데 `switch()` 메소드를 이용하여 인자로 받은 callable 객체를 실행할 수 있습니다.
해당 함수 내에서 다른 greenlet을 스케줄링하여 연쇄적으로 작업을 진행할 수도 있는데, 이때 기존 greenlet은 작동을 멈추고 다른 greenlet이 실행됩니다.
실행이 끝나고 greenlet 스택이 다시 비게 되면 해당 greenlet은 죽은 상태가 됩니다.

아래는 대략적인 사용 예제입니다.

```python
from greenlet import greenlet

def task():
    print("task 실행")
    g2.switch()
    return "실행 종료"

def subtask():
    print("sub task 실행")
    g1.switch()
    print("이 메시지는 출력 안댐.")

g1 = greenlet(task)
g2 = greenlet(subtask)
result = g1.switch()
print(result)
# task 실행
# sub task 실행
# 실행 종료
```

Greenlet 객체 생성 후 `.switch()`를 호출하는 순간 처음 greenlet이 실행되어 내부에 걸어둔 `task` 함수가 호출됩니다.
해당 함수 내에서는 두번째 greenlet를 호출하는데, switch되는 시점이 되면 `task`는 잠시 실행을 멈추고 제어권이 두번째 greenlet으로 넘어가 `subtask` 함수가 실행됩니다.
다시 제어권이 첫번째 greenlet으로 돌아오면 이전 `task` 함수의 중단되었던 부분부터 다시 실행이 재개됩니다.

언듯 보면 코루틴이 `coroutine.send(val)` 방식으로 제어권을 주고 받는것과 비슷해 보입니다.
사실 greenlet은 파이썬에서 코루틴이 정식으로 지원되기 이전에 코루틴을 지원하기 위해 만들어진 모듈입니다.
이런 방식으로 `yield`, `await` 구문 없이도 코루틴을 실행할 수 있다는 점에 큰 의의가 있습니다.

---

# 3. Eventlet

greenlet으로 파이썬에서 코루틴을 사용할 수 있게 되었는데, 이로 인해 여러 파생 라이브러리들이 생겨났습니다.
대표적으로 **Eventlet**은 greenlet 기반 동시성을 위한 네트워크 라이브러리 입니다.

아래에 eventlet을 이용하여 여러 웹 사이트의 응답을 가져오는 예제를 작성해 보았습니다.

```python
import eventlet
from eventlet.green.urllib.request import urlopen
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

urls = [
    "https://google.com",
    "http://python.org/images/python-logo.gif",
    "https://blog.miintto.com",
]

def get_request(url):
    return urlopen(url)

pool = eventlet.GreenPool()

for res in pool.imap(get_request, urls):
    print(res.status)
# 200
# 200
# 200
```

비록 여기서는 크롤러의 예시만 들었지만, 그 외에도 WSGI 서버, 웹소켓 통신 등에 응용할 수도 있습니다.

---

# 4. Gevent

**Gevent**도 greenlet 기반으로 코루틴을 사용하는 네트워크 라이브러리입니다.
eventlet을 더 발전시켜서 구현을 단순화 하였으며, libev 및 libuv 이벤트 루프를 도입하여 성능적으로도 더 나아졌습니다.

```python
import gevent
from urllib.request import urlopen

urls = [
    "https://google.com",
    "http://python.org/images/python-logo.gif",
    "https://blog.miintto.com",
]

def get_request(url):
    res = urlopen(url)
    print(res.status)

gevent.joinall(
    [gevent.spawn(get_request, url) for url in urls]
)
# 200
# 200
# 200
```

`spawn()` 메소드 호출시 greenlet 객체가 생성되며 내부에 인자로 받은 함수를 스케줄링합니다.
`joinall()` 메소드는 greenlet 배열을 입력받는데, 입력받은 greenlet들이 모두 실행될 때까지 블록됩니다.
어떻게 보면 `threading.Thread.join()`와 비슷한 기능을 합니다.

---

References

- [Green thread - Wikipedia](https://en.wikipedia.org/wiki/Green_thread)
- [threading — 스레드 기반 병렬 처리](https://docs.python.org/ko/3/library/threading.html)
- [greenlet: Lightweight concurrent programming — greenlet documentation](https://greenlet.readthedocs.io/en/latest/index.html)
- [greenlet은 어떻게 구현했을까?](https://lee-seungjae.github.io/greenlet.html)
- [What is gevent? — gevent documentation](http://www.gevent.org/)
- [Gevent 튜토리얼](http://leekchan.com/gevent-tutorial-ko/#greenlets)
- [[Python] Greenlet과 Gevent(WSGI 성능 향상)](https://kimjingo.tistory.com/81)
