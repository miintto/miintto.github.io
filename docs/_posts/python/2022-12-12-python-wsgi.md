---
layout: post
title: "[파이썬] WSGI는 왜 필요할까?"
category: python
tags:
  - python
  - wsgi
  - was
  - web server
thumbnail: "/img/thumbnails/python.png"
---

일반적으로 파이썬을 이용하여 웹 개발을 하는 경우, 일례로 django를 사용한다고 가정해 볼 때 로컬 환경에서는 `manage.py runserver` 명렁어를 이용하여 서버를 구동시킵니다.
하지만 실제 프로덕션 레벨에서는 서버 내에서 `runserver` 명령어로 실행하는 경우는 거의 없고, 보통 어플리케이션 앞단에 **WSGI** 라고 불리는 gunicorn, uwsgi 등의 별도 프로세스를 이용하여 구동시킵니다.
그렇다면 이런 별도의 WSGI 프로그램이 왜 필요하며 어떤 역할을 하는지 한 번 살펴봅시다.

---

# 1. Ahead of WSGI

2000년대 초반까지 파이썬은 Zope, SkunkWeb, Webware 등 다양한 프레임위크를 이용하여 웹 어플리케이션을 개발하였습니다.
하지만 당시 웹서버와 어플리케이션간 통신에 대한 명확한 규율이 없어서 사용자들은 각 프레임워크에 알맞은 서버 인터페이스<i>(Medusa, mod_python, CGI 등)</i> 선택에 제한이 생길 수밖에 없었습니다.
이는 당시 자바가 servlet API를 도입하여 어떤 자바 프레임워크로 작성하더라도 호환 가능하게 설계된 것에 대비됩니다.

마침내 2003년에 이르러 파이썬 어플리케이션과 서버 간의 통신 규약을 표준화하여 여러 프레임워크간에 이식성을 향상시키려는 움직임이 일어났으며,
[PEP-3303](https://peps.python.org/pep-0333/)에서 서버와 파이썬 어플리케이션 간의 표준 규약으로 **WSGI**(Web Server Gateway Interface)를 제안하였습니다. 

---

# 2. WSGI

WSGI의 주요 목적은 웹 서버와 어플리케이션 사이의 모든 상호작용에 대해 간단하고도 포괄적인 인터페이스를 제공하는 것입니다.
예를 들어 웹 서버로부터 HTTP 요청을 받은 경우 어플리케이션으로 전달할 때 어떤 형식(`dict`, `str` 혹은 `bytes` 등)으로 전달할지,
또 통신 중 예외 상황이 발생한 경우 어떻게 처리할지 등에 대한 명세를 담고 있습니다.
현시점에서 Django, Flask 등 두루 쓰이는 대다수의 _(FastAPI 같은 asgi는 제외하면..)_ 파이썬 프레임워크는 WSGI의 표준을 따르고 있습니다.
따라서 어플리케이션 개발자는 WSGI 내부 설계나 배포에 대한 고민 없이 어플리케이션 내부 프레임워크에만 집중할 수 있습니다.

<img src="/img/posts/python-wsgi-flow.png" style="max-width:600px"/>

그렇다면 WSGI은 자신과 맞닿아 있는 서버와 어플리케이션 간에 구체적으로 어떤 규약을 따라야 하는지 살펴봅시다.

## 2.1 Application 방면

어플리케이션 객체는 두 변수를 입력받는 callable 객체 형태여야 합니다.
즉, 파이썬에서 함수 형태거나 혹은 `__call__` 메소드가 정의된 클래스 객체를 이용하여 어플리에이션 작성이 가능합니다.
또한 서버 및 게이트웨이로부터 요청이 반복되어 들어올 수 있으므로 여러번 호출할 수 있어야 합니다.

```python
# main.py
def wsgi_app(environ, start_response):
    status = "200 OK"
    headers = [("Content-type", "text/plain")]
    start_response(status, headers)
    return [b"It Works!"]
```

## 2.2 Server 방면

웹서버는 HTTP 클라이언트로부터 요청이 들어올 때마다 어플리케이션 측에서 제공하는 callable 객체를 한 번씩 호출합니다.

## 2.3 상세 스펙

어플리케이션은 반드시 callable 객체이어야 하며 다음 두 변수 `environ`, `start_response`를 입력받습니다.
다만 어플리케이션 호출 시 위치 인자(positional arguments)로 입력받기 때문에 변수명을 동일하게 가져갈 필요는 없습니다.

### 2.3.1 environ

**`environ`**은 CGI 정보를 포함한 `dict` 객체입니다.
반드시 다른 파이썬 mapping 객체를 상속받은 객체가 아닌 파이썬 builtin `dict` 객체 형태이며, 어플리케이션에서는 해당 dictionary 객체를 원하는 대로 가공할 수 있습니다.
다음 아래 정보가 반드시 포함되어있습니다.

- **`REQUEST_METHOD`**: 요청 HTTP 메소드
- **`SCRIPT_NAME`**: 요청 URL의 초기 부분
- **`PATH_INFO`**: 요청 URL의 path 부분
- **`QUERY_STRING`**: 요청 URL에서 `"?"` 뒤로 넘어온 부분
- **`CONTENT_TYPE`**: 요청 시 넘어온 Content-Type 값
- **`CONTENT_LENGTH`**: 요청 시 넘어온 Content-Length 값
- **`SERVER_NAME`, `SERVER_PORT`**: `HTTP_HOST`가 정의되지 않은 경우 두 값을 조합하여 설정 가능
- **`SERVER_PROTOCOL`**: 클라이언트 요청의 프로토콜 버전
- **기타 `HTTP_` 변수들**: 클라이언트에서 넘어온 HTTP 요청 헤더는 `HTTP_` prefix를 붙여서 넘어옵니다.

### 2.3.2 start_response

**`start_response`**는 두 인자 `status`, `response_headers`와 선택적으로 `exc_info`를 입력받는 callable 객체입니다.
호출 시 HTTP 응답 처리를 시작하며 리턴값으로 `write(body_data)` callable 객체를 반환합니다.

입력값으로 받는 **`status`**는 "200 OK", "404 Not Found"와 같이 상태를 나타내는 스트링이며, **`response_headers`**는 HTTP 응답 헤더의 `(header_name, header_value)` 튜플 쌍을 담은 `list` 객체입니다.
헤더는 파이썬 `list` 타입이어야 하고, 필요에 따라 서버 측에서 해당 리스트 내용을 가공할 수도 있습니다.
헤더의 `header_name` 값에는 구두점이나 세미콜론이 포함되어서는 안 되며 모든 스트링에 `\n`, `\r`과 같은 개행 문자가 들어가서는 안 됩니다. (이는 추후 설명할 서버의 검증 단계에서 복잡성을 줄이기 위해서입니다.)

`start_response`가 호출되면 서버에서는 헤더를 검증하며, 만일 형태가 올바르지 않은 경우 어플리케이션이 실행되는 중에도 에러를 발생시켜야 합니다.
다만 `start_response`의 결과로 헤더를 직접 전송하지 않습니다.
대신 헤더 정보를 내부에 저장해두었다가 어플리케이션 반환 값의 처음 iteration 작업이 시작되거나, 혹은 `write()` 함수가 처음 호출되는 시점에 전송됩니다.
이렇게 헤더 전송을 마지막까지 지연하는 이유는 어플리케이션의 출력값을 마지막까지 처리하면서 오류가 발생하는 즉시 에러 응답으로 대치하기 위해서입니다.
예를 들어 응답 body를 생성하는 도중 에러가 발생하는 경우 status를 "200 OK"에서 "500 Internal Server Error"로 변경 후 서버로 전달됩니다.

---

References

- [PEP 3333 – Python Web Server Gateway Interface v1.0.1](https://peps.python.org/pep-3333/)
- [An Introduction to the Python Web Server Gateway Interface (WSGI)](http://ivory.idyll.org/articles/wsgi-intro/what-is-wsgi.html)
- [CGI의 발전에 대해 알아보자.](https://velog.io/@seanlion/cgihistory)
- [WSGI 란? - Sungho's Blog](https://sgc109.github.io/2020/08/15/python-wsgi/)
