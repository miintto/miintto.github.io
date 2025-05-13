---
layout: post
title: "[파이썬] ASGI 표준 규약"
category: python
tags:
  - python
  - asgi
  - asyncio
thumbnail: "/img/thumbnails/python.png"
---

이전에 [WSGI의 스펙](/docs/python-wsgi)에 대해 다루었던 적이 있었습니다.
보통 Python으로 어플리케이션을 만드는 경우 Flask, Django 프레임워크를 주로 사용했었지만, 현재는 FastAPI가 떠오르면서 비동기 서버도 꽤나 보편화되고 있는데요.
비동기 서버도 WSGI와 비슷하게 인터페이스 정의 규칙이 존재합니다.

---

# 1. WSGI의 한계

기존 WSGI를 개선하지 않고 비동기 어플리케이션을 위한 새로운 통신 규약을 만든 이유는 WSGI가 구조적으로 한계를 가지고 있기 때문입니다.

기본적으로 WSGI는 단순한 요청-응답에 최적화되어 있습니다.
클라이언트가 요청을 보내면 WSGI 서버가 이를 받아서 Django 등의 어플리케이션으로 전달하고, 어플리케이션의 응답을 받아서 다시 클라이언트로 전송하는 방식으로 작동합니다.
이러한 통신 방식에서는 요청 처리가 끝나면 연결이 닫혀버리기 때문에 지속적인 연결이 필요한 통신에는 적합하지 않습니다.

예를 들어 Long-Polling과 같은 통신 방식에서는 요청을 길게 유지해야 하는데, 이 경우 서버의 스레드 또는 프로세스를 오랫동안 점유하게 되어 불필요하게 리소스가 낭비될 수 있습니다.
또한 웹소켓(WebSocket)과 같은 Stateful 통신에서는 클라이언트와의 지속적인 데이터를 주고받아야 하지만 WSGI 구조상 효율적으로 처리할 수 없습니다.

WSGI의 요청을 처리하는 메인 callable 함수를 비동기로 바꾸어 여러 요청을 처리하도록 구성하는 방법도 있습니다.
하지만 callable이 인자로 받는 `environ`, `start_response` 형태로는 하나의 요청으로 하나의 path만 처리할 수 있기 때문에 여러 이벤트가 들어오는 요청은 처리할 수 없습니다.

이를 개선하기 위해 **ASGI**(Asynchronous Server Gateway Interface)가 등장하게 되었습니다.

# 2. ASGI

ASGI는 비동기 callable 함수 호출 방식을 채택하였습니다.
WSGI처럼 단순한 동기 요청-응답 인터페이스가 아니라 비동기 이벤트 루프를 기반으로 동작하는 프로토콜을 정의하였으며, 이로 인해 동기와 비동기(async) 모두 지원하여 기존 WSGI 기능을 확장하였습니다.

ASGI의 비동기 callable은 3개의 인자로 `scope`, `recieve`, `send`를 입력받습니다.

- **scope**: `dict`
  - 요청의 메타 데이터를 담고 있습니다. 프로토콜 유형, HTTP 메소드, 헤더 등의 정보를 포함하고 있습니다.
- **recieve**: `Callable`
  - 클라이언트로부터 이벤트를 받는 async 메소드입니다.
- **send**: `Callable`
  - 클라이언트에게 응답을 보내는 async 메소드입니다.

예시로 callable을 작성해 보면 아래와 같습니다.

```python
async def app(scope: dict, receive: Callable, send: Callable):
    event = await receive()
    ...
    await send({"type": "http.response.start", "status": 200, ...})
    await send({"type": "http.response.body", "body": b"ok!"})
```

## 2.1 Connection Scope

어플리케이션에 전달되는 첫번째 인자는 딕셔너리(dictionary) 타입의 `scope` 입니다.
해당 객체는 각 연결의 메타데이터를 담고 있습니다.

주요 값은 아래와 같습니다.

| key | description | example
|---|---|---
| type | 요청의 타입 (http, websocket, lifespan) | "http"
| asgi | ASGI 버전 정보 | {"version": "3.0", "spec_version": "2.3"}
| http_version | HTTP 버전 | "1.1"
| method | HTTP 메소드 (GET, POST) | "GET"
| scheme | 요청 프로토콜 (http, https, ws, wss) | "http"
| path | 요청 경로 | "/api/items"
| query_string | `?` 이후의 쿼리 스트링 (바이트 스트링) | b"user_id=123"
| headers | 요청 헤더 (바이트 리스트) | [(b"host", b"example.com")]

## 2.2 Events

ASGI에서는 WSGI처럼 단순히 요청-응답으로 처리하지 않고, 각 프로토콜을 이벤트(event)의 연속으로 분해하여 처리합니다.
즉, 어플리케이션은 특정 이벤트를 받아서(receive), 필요한 경우 새로운 이벤트를 보낼(send) 수 있습니다.
ASGI callable의 두 인자 `receive`, `send`는 이러한 이벤트를 처리하는 메소드입니다.

각 이벤트는 딕셔너리(Dictionary) 형태로 표현됩니다.
또한 이벤트의 딕셔너리는 **type** 키를 가지고 있으며, 이를 통해 이벤트 종류를 구별할 수 있습니다.
어플리케이션에서는 이러한 type 키를 확인하여 이벤트를 판별한 후에 적절한 작업을 진행하게 됩니다.

### 2.2.1 HTTP 통신

예를 들어 HTTP 통신의 경우 아래와 같은 이벤트가 순차적으로 발생합니다.

```python
# Client → Server: 요청
{
  "type": "http.request",
  "body": b"Hello",
  "more_body": False
}

# Server → Client: 응답 헤더 전송
{
  "type": "http.response.start",
  "status": 200,
  "headers": [(b"content-type", b"text/plain")]
}

# Server → Client: 응답 본문 전송
{
  "type": "http.response.body",
  "body": b"Hello, ASGI!"
}

# Client → Server: 연결 종료
{
  "type": "http.disconnect"
}
```

그리고 실제 어플리케이션에서는 아래와 같이 처리하게 됩니다.

```python
async def app(scope, receive, send):
    if scope["type"] == "http":  # HTTP 요청 확인
        # HTTP 응답 헤더 전송
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"text/plain")],
        })
        # HTTP 응답 본문 전송
        await send({
            "type": "http.response.body",
            "body": b"Hello, ASGI!",
            "more_body": False,
        })
```

### 2.2.2 WebSocket 통신

웹소켓은 HTTP보다 훨씬 이벤트 중심적인 프로토콜이기 때문에, 다양한 WebSocket 이벤트 딕셔너리가 순차적으로 들어오게 됩니다.

```python
# Client → Server: 연결 요청
{
  "type": "websocket.connect"
}

# Server → Client: 연결 수락
{
  "type": "websocket.accept"
}

# Client → Server: 클라이언트 메시지
{
  "type": "websocket.receive",
  "text": "Hello!",   # 문자열 메시지
  # OR
  "bytes": b"...",    # 바이너리 메시지
}

# Server → Client: 서버 응답 메시지
{
  "type": "websocket.send",
  "text": "Hello! I'm Server",   # 문자열 메시지
  # OR
  "bytes": b"...",    # 바이너리 메시지
}

# Client → Server: 연결 종료
{
  "type": "websocket.disconnect"
}
```

`websocket.receive` 타입으로 메시지를 수신하는 경우 `text` 혹은 `bytes`중 하나만 존재합니다.
`text`는 유니코드 스트링이고 `bytes`는 바이트 타입입니다.
`websocket.send`로 메시지를 응답하는 경우에도 `text`, `bytes`중 하나만 사용해야 합니다.

아래는 간단한 웹소켓 어플리케이션 예제입니다.

```python
async def app(scope, receive, send):
    if scope["type"] == "websocket":
        if event["type"] == "websocket.connect":
            await send({"type": "websocket.accept"})

        while True:
            event = await receive()
            if event["type"] == "websocket.receive":
                await send({
                    "type": "websocket.send",
                    "text": f"{event['text']} I'm Server"
                })
            elif event["type"] == "websocket.disconnect":
                break
```

---

References

- [ASGI Documentation — ASGI 3.0 documentation](https://asgi.readthedocs.io/en/latest/){:target="_blank"}
- [CGI, WSGI, ASGI 정리](https://kangbk0120.github.io/articles/2022-02/cgi-wcgi-asgi){:target="_blank"}
