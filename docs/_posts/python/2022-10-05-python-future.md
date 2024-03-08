---
layout: post
title: "[파이썬] Future를 이용한 동시성"
date: 2022-10-05
category: python
tags:
  - python
  - future
  - multi-threading
thumbnail: "/img/thumbnails/python-future.png"
---

# 1. Future

**`Future`**는 비동기 작업의 상태를 나타내주는 객체로 계산이 지연된 것을 표현하기 위해 사용합니다.
특정한 작업을 큐에 넣거나 완료 상태를 조사하고, 에러 또는 결과를 반환하는 역할을 합니다.
파이썬 내장 라이브러리 `concurrent.futures` 와 `asyncio` 내부에 구현되어 있으며 핵심 기능은 같지만 살짝 다르게 동작하는 부분도 있습니다.
JavaScript 의 Promise 객체와 유사하다고 볼 수도 있습니다.

`Future` 객체는 반드시 `concurrent.futures`, `asyncio`과 같은 동시성 라이브러리의 통제 하에 사용해야합니다.
객체의 상태를 명시해주는 인터페이스도 제공하여 필요한 경우에는 실행이 완료되었는지 여부를 확인할 수도 있습니다.
`Future` 객체에 대한 요청은 반드시 이러한 라이브러리를 이용해야 하며 해당 객체를 직접 생성하거나 변경하는 것은 지양해야합니다.
해당 라이브러리는 `Future` 객체를 생성 및 스케줄링 하며, 작업이 완료된 경우 `Future` 객체의 상태를 변경합니다.
웬만하면 우리는 직접 `Future` 객체를 마주할 일은 없고, 라이브러리 내부에서 해당 객체를 사용하여 동작하도록 되어있습니다.

## 1.1 concurrent.future

```python
class Future(object):
    def __init__(self):
        self._condition = threading.Condition()
        self._state = PENDING
        self._result = None
        self._exception = None
        self._waiters = []
        self._done_callbacks = []

    def add_done_callback(self, fn):
        with self._condition:
            if self._state not in [CANCELLED, CANCELLED_AND_NOTIFIED, FINISHED]:
                self._done_callbacks.append(fn)
                return
        try:
            fn(self)
        except Exception:
            LOGGER.exception('exception calling callback for %r', self)
```

`add_done_callback`메소드는 

```python
    def result(self, timeout=None):
        try:
            with self._condition:
                if self._state in [CANCELLED, CANCELLED_AND_NOTIFIED]:
                    raise CancelledError()
                elif self._state == FINISHED:
                    return self.__get_result()

                self._condition.wait(timeout)

                if self._state in [CANCELLED, CANCELLED_AND_NOTIFIED]:
                    raise CancelledError()
                elif self._state == FINISHED:
                    return self.__get_result()
                else:
                    raise TimeoutError()
        finally:
            # Break a reference cycle with the exception in self._exception
            self = None
```

# 2. Multi Threading

다음은 두 가지 방법을 이용하여 웹 상의 이미지를 가져오는 코드입니다.
requests를 이용하여 요청을 보냈고, 이미지 저장 소요시간을 가정하여 1초의 sleep을 두었습니다. 

```python
from concurrent import futures
import time
import requests

FLAG_LIST = ["CA", "DE", "FR", "GB", "IT", "JP", "KR", "US"]

BASE_URL = "https://www.fluentpython.com"


def get_request(flag: str) -> int:
    res = requests.get(
        url=f"{BASE_URL}/data/flags/{flag.lower()}/{flag.lower()}.gif"
    )
    return res.status_code

def save_data(flag: str) -> int:
    status = get_request(flag)
    time.sleep(1)
    print(flag, end=" ")
    return status

def download1():
    """이미지를 차례로 다운로드"""
    start = time.time()
    status_list = map(save_data, FLAG_LIST)
    count = len(list(status_list))
    print("Count:", count)
    print("Time:", time.time() - start)

def download2():
    """이미지를 멀티 스레드를 사용하여 다운로드"""
    start = time.time()
    workers = 8
    with futures.ThreadPoolExecutor(workers) as executor:
        res = executor.map(save_data, FLAG_LIST)
    count = len(list(res))
    print("Count:", count)
    print("Time:", time.time() - start)


download1()
# CA DE FR IT JP KR GB US Count: 8
# Time: 9.633826971054077

download2()
# JP FR GB US DE KR CA IT Count: 8
# Time: 1.3326849937438965
```

`download1` 에서는 이미지를 순차적으로 가져오고 `download2` 함수에서는 ThreadPoolExecutor 를 이용하여 가져오고 있습니다.
두 번째 방법이 훨씬 시간이 적게 걸리는 것을 확인할 수 있는데, 멀티 스레드를 사용하여 동시에 여러 작업을 수행하였기 때문입니다.

`Executor.map()` 함수는 내부에서 Future 를 이용합니다.
`Executor.submit()` 의 결과로 Future 객체들을 생성하고 해당 객체들이 담긴 제너레이터를 결과값으로 반환합니다.
제너레이터에 `__next__` 메소드가 호출될때마다 각 Future 객체의 `result()` 함수를 실행하여 그 결과값을 호출한 순서대로 반환합니다.
해당 작업이 진행되는 동안 Future 객체는 Executor 내부에서만 존재하므로 Future 객체를 직접 볼 수는 없습니다.

앞서 [**GIL**](/docs/python-gil)을 설명하면서 파이썬은 기본적으로 단일 스레드만 사용한다고 말씀드렸습니다.
하지만 `requests`, `sleep` 과 같은 입출력 작업에서는 GIL을 우회하므로 입출력을 기다리는 동안 다른 스레드로 전환할 수 있습니다.
이러한 방식을 활용하면 여러 스레드를 이용하여 효율적으로 프로그램을 실행할 수 있습니다.

## 2.1 Multi Processing

스레드 대신 여러 프로세스를 사용하도록 _ProcessPoolExecutor_ 로 대치할 수도 있습니다.
해당 클래스를 이용하면 작업을 여러 프로세스에 분산시켜 병렬 컴퓨팅을 가능하게 합니다.
다만 단순 입출력에서는 멀티 프로세스를 사용해도 큰 성능상의 이득을 얻지 못할수도 있는데, 대신 복잡한 연산 위주의 작업이라면 멀티 프로세스를 활용하는게 파이썬에서는 더 효율적입니다.

---

References

- Luciano Ramalho, Fluent Python: Clear, Concise, and Effective Programming, 강권학, 한빛미디어, 2016-08-12
- [concurrent.futures - Launching parallel tasks - Python 3.10.2 documentation](https://docs.python.org/ko/3/library/concurrent.futures.html)
