---
layout: post
title: "Async 환경에서 SQLAlchemy 세션 관리"
date: 2023-03-01
tags:
  - python
  - sqlalchemy
  - session
  - asyncio
banner: "/img/posts/sqlalchemy-asyncsession-banner.png"
---

이전에 [SQLAlchemy의 세션 관리](/docs/2023/01/03/python-sqlalchemy-session.html) 포스트에서 SQLAlchemy 라이브러리 내부에서 세션의 작동 방식을 알아보았습니다.
하지만 해당 내용은 sync 환경에서만 유효하며, asyncio 기반으로 실행되는 경우에는 여러 side effect가 발생할 수 있습니다.
SQLAlchemy 버전이 1.4로 올라가면서 asyncio와 호환될 수 있도록 업데이트되었는데, 해당 내용을 기반으로 asynchronous 환경에서 SQLAlchemy 세션을 사용하는 방법을 정리해 보았습니다.

> _아래 내용은 현 시점 (2023-03) 기준 최신 버전인 SQLAlchemy 2.0.4 기반으로 작셩하였습니다._

---

# 1. `AsyncSession`

세션 구현체로 `sqlalchemy.ext.asyncio.AsyncSession` 를 사용할 수 있습니다.
또한 엔진 연결 시에는 `create_async_engine` 메소드를 이용하여 생성해야 합니다.

```python
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

engine = create_async_engine("postgresql+asyncpg://user:password@localhost:5432/test_db")

async with AsyncSession(engine) as session:
    await session.execute(
        insert(User).values(user_name="myname", email="miintto.log@gmail.com")
    )
    await session.commit()
await engine.dispose()
```

`create_async_engine`에서 사용하는 인자들은 대부분 `create_engine`과 동일하지만, 엔진 연결 시에는 async가 지원되는 DBAPI 드라이버를 사용해야만 합니다.
사용 가능한 드라이버로는 `asyncpg` (PostgreSQL), `aiomysql` (MySQL), `aioodbc` (MSSQL) 등이 있습니다.

비동기 세션 구현체인 `AsyncSession` 또한 기존 `Session`의 기능을 대부분 지원하지만 2.0 문법 스타일로 작성해야 합니다.
데이터 조회의 경우 `Query`를 사용한 방식 대신 `Session.execute()` 메소드 내부에서 `select()`로 가져오는 방식으로 작성해야 합니다.
그 외에 `add()`, `commit()`, `close()` 등의 메소드들은 그대로 사용할 수 있습니다.
2.0 스타일에 대한 자세한 내용은 [Glossary - 2.0-style](https://docs.sqlalchemy.org/en/14/glossary.html#term-2.0-style)를 참고하시면 됩니다.

또한 context manager 기능도 지원해서 `async with` 구문이 끝나는 시점에 자동으로 `AsyncSession.close()`가 실행되도록 프로그래밍할 수도 있습니다.

```python
class AsyncSession(ReversibleProxy):
    ...
    async def __aenter__(self):
        return self

    async def __aexit__(self, type_, value, traceback):
        task = asyncio.get_event_loop().create_task(self.close())
        await asyncio.shield(task)
```

---

# 2. `async_scoped_session`

궁극적으로 어플리케이션에 SQLAlchemy를 적용하려고 한다면 `scoped_session` 도입을 고려할 텐데,
이를 그대로 async 환경에 적용한다면 여러가지 이슈가 발생할 수 있습니다.

`scoped_session`는 기본적으로 스레드별로 세션을 관리하도록 되어있지만, asyncio의 이벤트 루프는 단일 스레드 기반으로 작동합니다.
이때 만일 여러 request가 같은 프로세스에 할당된다면 중첩된 request들이 동일한 세션 객체를 할당받아 작업을 할 수 있습니다.
이런 상황은 매우 위험한데 의도치 않게 세션 내에 ORM 객체들이 서로 공유되거나 이미 롤백 된 세션을 다른 request에서 가져가서 다시 사용하는 등 개발자가 의도한 대로 동작하지 않을 수 있습니다.
따러서 이러한 async 환경에서의 이슈를 해결하기 위해 SQLAlchemy에서는 `async_scoped_session` 클래스를 지원하고 있습니다.

```python
class async_scoped_session(ScopedSessionMixin):
    """Provides scoped management of :class:`.AsyncSession` objects."""

    def __init__(self, session_factory, scopefunc):
        self.session_factory = session_factory
        self.registry = ScopedRegistry(session_factory, scopefunc)
```

`async_scoped_session` 에서는 thread-local storage를 회피하기 위해 `scopefunc`를 강제하고 있습니다.
따라서 registry는 반드시 `ScopedRegistry`만 사용가능합니다.
`scopefunc`를 적절하게 설정해주면 동일한 스레드에서도 클라이언트마다 알맞은 세션을 추적할 수 있습니다.
아래 대략적인 사용 예시를 작성했습니다.

```python
import asyncio
from sqlalchemy.ext.asyncio import (
    async_scoped_session,
    async_sessionmaker,
    create_async_engine,
)

engine = create_async_engine("postgresql+asyncpg://user:password@localhost:5432/test_db")
session_factory = async_sessionmaker(bind=engine)
Session = async_scoped_session(session_factory, scopefunc=asyncio.current_task)

async with Session() as session:
    # To Something
    await session.commit()
await Session.remove()
await engine.dispose()
```

위에서는 예시로 `scopefunc` 값으로 `asyncio.current_task` 메소드를 넣어 주었는데, 이러한 방식으로 동일한 스레드에서도 할당된 Task마다 세션을 구분할 수 있습니다.
다만 이런 식으로 세션을 관리하면 세션을 종료하여도 registry 내부 dictionary에 세션 객체가 남아서 계속 메모리를 차지하기 때문에 작업이 끝날 때마다 `async_scoped_session.remove()` 메소드를 호출하여 메모리에서 정리해야 합니다.

마지막에 실행되는 `AsyncEngine.dispose()` 메소드 실행도 필요한 작업인데, 해당 메소드는 현재 사용 중인 커넥션 풀들을 다시 반환하는 역할을 합니다.
일반적인 blocking IO와는 대조적으로 awaitable 구문을 한 번 빠져나와 버리면 다시 `await` 메소드를 호출할 수 없기 때문에 커넥션들이 올바르게 처리되지 않을 수 있습니다.
이런 식으로 엔진이 정상적으로 종료되지 않는다면 _RuntimeError: Event loop is closed_ 와 같은 경고가 발생할 수도 있습니다.

---

References

- [Asynchronous I/O (asyncio) — SQLAlchemy 2.0 Documentation](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
