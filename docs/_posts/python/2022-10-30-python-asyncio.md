---
layout: post
title: "[파이썬] asyncio"
category: python
tags:
  - python
  - asyncio
  - native coroutine
  - event loop
toc: true
thumbnail: "/img/thumbnails/python.png"
---

앞서 설명했듯이 [**코루틴**](/docs/python-coroutine)은 기본적으로 제어권을 호출자로부터 넘겨받아 작업을 수행하고 다시 제어권을 반환하는 방식으로 작동합니다.
이때, 만일 코루틴이 데이터 입출력 작업으로 잠시 대기한다면 호출자 또한 코루틴이 작업을 끝낼 때까지 하염없이 기다리는 상황이 발생합니다.
이런 상황은 매우 비효율적으로 보이지만, 혹시 코루틴이 대기하는 동안 제어권을 다시 호출자로 넘겨주어 다른 작업을 할 수 있도록 한다면 좀 더 효율적으로 프로그램이 작동하지 않을까?
이런 아이디어에서 asyncio를 이용한 비동기 처리가 생겨났습니다.

# 1. Native Coroutine

이전 코루틴을 생성하는 경우 제너레이터와 유사한 방식을 사용하였습니다. `asyncio` 라이브러리에서 지원하는 방식으로도 코루틴을 생성할 수 있습니다.
이런 코루틴은 기존 제너레이터 기반의 코루틴과 구분하기 위해 **네이티브 코루틴**(native coroutine) 이라고 부릅니다.

```python
async def sleep(n: int):
    print(f"Sleep {n} seconds~!")
    await asyncio.sleep(n)
    return n

asyncio.iscoroutine(sleep(1))
# True

sleep(1)
# <coroutine object sleep at 0x7f88b04b1200>
# RuntimeWarning: coroutine 'sleep' was never awaited

asyncio.run(sleep(3))
# Sleep 3 seconds~!
```

메소드를 정의할 때 `async` 를 붙이면 이 메소드는 코루틴이 됩니다.
이러한 코루틴은 `asyncio.run()`을 이용하여 실행할 수 있으며, 단순히 동기로 호출시에는 실행되지 않고 경고 메세지와 함께 코루틴 객체만 반환합니다.
코루틴 내부에서 `await` 뒤에는 Awaitable 객체만 올 수 있습니다.
앞서 설명한 `Future`도 Awaitable 객체입니다.

#### [참고] 과거 `yield from` 을 사용한 문법

현재 네이티브 코루틴은 일반적으로 async/await 구문을 사용하는 게 표준이지만, 파이썬 3.5 에서 async/await 문법이 공식적으로 채택되기 전까지는 `yield from`을 사용하였습니다.
`await` 뒤에 코루틴 객체를 선언하여 또 다른 코루틴을 실행하는 것도 `yield from`과 같은 원리이기 때문입니다.

아래 과거 방식대로 코루틴을 만들고 실행하는 과정을 작성하였습니다.

```python
@asyncio.coroutine
def sleep(n: int):
    print(f"Sleep {n} seconds~!")
    yield from asyncio.sleep(n)
    return n

loop = asyncio.get_event_loop()
result = loop.run_until_complete(sleep(3))
# Sleep 3 seconds~!
loop.close()
```

코루틴을 실행하는 부분도 asyncio 에서 제공하는 저수준 API를 이용하는 방법으로 작성하였습니다.
현재는 asyncio 라이브러리에서 고수준 API `asyncio.run()`을 제공하여 번거로운 과정을 거칠 필요가 없지만, 이전에는 이벤트 루프를 직접 만들어 실행하고 종료하는 과정을 직접 구현해야 했습니다.
이벤트 루프에 대해서는 좀 더 아래에서 자세히 다루겠습니다.

실행 과정을 살펴보면 처음 `asyncio.get_event_loop()`를 이용하여 해당 스레드에서 실행되고 있는 이벤트 루프를 가져옵니다.
만일 이벤트 루프가 없다면 새로 생성합니다.
그리고 `run_until_complete()`에서 이벤트 루프가 코루틴을 실행시키는데, 해당 코루틴은 태스크(Task)로 실행되도록 예약되며 실행이 완료되면 코루틴의 반환 값을 이벤트 루프로 넘겨줍니다.
즉 코루틴의 반환 값이 `run_until_complete()`의 결과로 반환됩니다.
태스크 실행이 끝나면 이벤트 루프를 종료합니다.

---

# 2. Event Loop

코루틴을 실행시키는 핵심 부분은 바로 **이벤트 루프**(event loop)입니다.
이벤트 루프는 스레드에서 실행되며 해당 스레드의 모든 콜백 및 태스크를 관리합니다.
하나의 태스크가 이벤트 루프에서 실행되고 있으면 해당 스레드에 다른 태스크는 실행될 수 없습니다.

일반적으로 이벤트 루프는 싱글 스레드 기반으로 동작합니다.
태스크가 `await` 구문에서 입출력을 위해 대기하게 되면 태스크는 제어권을 다시 이벤트 루프에 넘겨주게 되고 이벤트 루프는 다른 태스크를 실행합니다.
제어권을 받은 태스크는 다시 대기하던 부분부터 작업을 재개합니다.
이런 식으로 이벤트 루프는 동시에 여러 작업을 수행하는 효율을 낼 수 있습니다.

## 2.1 `run_until_complete`의 작동 원리

고수준 API `asyncio.run()`의 프로세스 내부에서는 위에서 설명한 `asyncio.get_event_loop()` 부터 `loop.close()`까지의 작업이 내재되어 있습니다.
해당 메소드들을 직접 사용하진 않더라도 각각의 기능을 숙지해두면 `asyncio.run()`이 실행되는 원리를 이해하기 쉽습니다.

이벤트 루프가 실제로 실행되는 곳은 `run_until_complete()` 내부인데, 해당 메소드가 동작하는 방식을 자세히 살펴봅시다.

<img src="/img/posts/python-asyncio-event-loop.png" style="max-width:720px"/>

먼저 `asyncio.run()`의 인자로 입력받은 코루틴은 태스크 객체로 래핑 된 후 이벤트 루프에 스케줄링 됩니다.
제일 처음에는 예약된 태스크가 아무것도 없으므로 해당 태스크는 곧바로 실행됩니다.
태스크가 실행되면 태스크 내부 래핑 되었던 코루틴의 `send()` 메소드를 호출하여 코루틴을 실행시킵니다.

처음 호출되는 코루틴을 시작으로 내부에 `await` 구문을 만나게 되는데 이런 식으로 연쇄적으로 코루틴을 호출하면서 코루틴 체인을 형성합니다.
그리고 코루틴 체인을 따라 내부로 들어가다 보면 반드시 sleep 혹은 입출력 관련 코루틴을 만나게 됩니다.
이러한 sleep & 입출력 코루틴은 내부에 Future 객체를 `await`하도록 되어있으며,
이때 태스크는 해당 Future의 상태가 완료가 될 때 실행될 콜백 함수를 등록합니다.
그리고 태스크는 자신의 실행을 중단하고 제어권을 이벤트 루프에 전달합니다.
해당 태스크는 다시 이벤트 루프로부터 제어권을 받을 때까지 대기합니다.
이벤트 루프는 자신에게 스케줄링 된 태스크 혹은 콜백 함수 중 우선순위가 높은 것을 선택한 후 해당 태스크에게 다시 제어권을 넘겨 실행시킵니다.

더 이상 실행할 태스크가 없어도 이벤트 루프는 작업중인 소켓을 계속해서 모니터링 합니다.
그러다 작업이 완료된 소켓을 발견하면 연결된 Future 객체의 상태를 완료로 변경하고 그 결과로 아까 등록하였던 콜백함수가 태스크로 스케줄링 됩니다.
대기하던 코루틴이 다시 재개되면서 `await` 부분으로 돌아오고 원하는 값을 얻은 경우 `return` 하게 됩니다.
이러한 과정이 반복되면서 코루틴 체인을 거슬러 올라가게 되고 태스크가 최초 실행되었던 코루틴이 `return` 하는 시점에 이르면 태스크가 종료됩니다.
그러면 이 태스크는 더 이상 스케줄링 되지 않고 `run_until_complete` 함수도 이렇게 종료됩니다.
이때 태스크의 결과값이 `run_until_complete`의 결과로 반환됩니다.

## 2.2 `asyncio.create_task`

위에서 살펴본 `asyncio.run()` 함수는 하나의 태스크만 생성하게 됩니다.
여러 태스크를 생성하기 위해서는 `asyncio.create_task()`를 활용할 수 있습니다.
해당 메소드의 인자로 넘겨진 코루틴들은 마찬가지로 태스크 객체로 래핑 되어 이벤트 루프에 스케줄링 됩니다.

이전 살펴본 [멀티 스레딩으로 웹 상의 이미지를 가져오는 부분](/docs/python-future#2-multi-threading)을 asyncio를 이용한다면 다음과 같이 작성할 수 있습니다.
이때 HTTP 프로토콜 통신을 위해서 aiohttp를 사용해야 합니다.

```python
import asyncio
import time
import aiohttp

FLAG_LIST = ["CA", "DE", "FR", "GB", "IT", "JP", "KR", "US"]

BASE_URL = "https://www.fluentpython.com"


async def get_request(flag: str) -> int:
    async with aiohttp.ClientSession() as session:
        async with session.get(
            url=f"{BASE_URL}/data/flags/{flag.lower()}/{flag.lower()}.gif",
            ssl=True,
        ) as res:
            return res.status

async def save_data(flag):
    status = await get_request(flag)
    await asyncio.sleep(1)
    print(flag, end=" ")
    return status

async def download3():
    """이미지를 asyncio를 사용하여 다운로드"""
    start = time.time()
    tasks = [asyncio.create_task(save_data(flag)) for flag in FLAG_LIST]
    done = await asyncio.gather(*tasks)
    print("Count:", len(done))
    print("Time:", time.time() - start)


asyncio.run(download3())
# KR GB IT US FR DE JP CA Count: 8
# Time: 1.2105381488800049
```

`asyncio.gather()` 메소드는 입력받은 Awaitable 객체들의 실행이 완료될 때까지 대기합니다.
내부 Future 객체의 상태가 모두 완료 상태가 되면 결과를 리스트로 반환합니다.

---

References

- Luciano Ramalho, Fluent Python: Clear, Concise, and Effective Programming, 강권학, 한빛미디어, 2016-08-12
- [asyncio - Python 3.10.2 documentation](https://docs.python.org/ko/3/library/asyncio.html)
- [파이썬 코딩 도장](https://dojang.io/mod/page/view.php?id=2469)
- [[Python] 비동기 프로그래밍 동작 원리 (asyncio)](https://it-eldorado.tistory.com/159)
