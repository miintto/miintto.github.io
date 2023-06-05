---
layout: post
title: "SQLAlchemy의 세션 관리"
date: 2023-01-03
category: sqlalchemy
tags:
  - python
  - sqlalchemy
  - session
  - orm
  - thread-local
banner: "/img/posts/sqlalchemy-session-banner.png"
---

보통 Django를 벗어나서 독자적인 ORM이 없는 파이썬 프레임워크를 사용한다면 아마 거의 대부분은 SQLAlchemy를 채택하여 사용할 겁니다.
최근 FastAPI를 이용해 개발하면서 SQLAlchemy를 다루어 보았는데,
해당 라이브러리에서 DB 세션을 어떻게 관리하는지 정리해 보았습니다.

---

# 1. Session

일반적으로 **세션**(session)이란 데이터베이스와 클라이언트 사이에서 통신을 시작하는 것부터 종료하기까지의 수명 기간을 의미합니다.
그리고 SQLAlchemy 라이브러리에서 이 세션의 구현체가 바로 `sqlalchemy.orm.Session` 클래스입니다.

`Session`은 identity map이라고 불리는 내부 공간에 ORM 객체들을 저장하며, 변경이 일어날 때마다 그 이력이 기록됩니다.
최초 쿼리 작업을 요청하거나 관련된 객체를 건드리는 순간 Session은 새로운 **트랜잭션**(transaction)을 생성하는데, 해당 트랜잭션은 세션이 커밋되거나 롤백 되기 전까지 유지됩니다.
그리고 해당 트랜잭션이 커밋되면 모든 변경 사항들을 데이터베이스로 전송합니다.

아래 코드는 `Session`을 이용하여 새 데이터를 생성하는 간단한 예시입니다.

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

engine = create_engine(url="postgresql://user:password@localhost:5432/test_db")

with Session(engine) as session:
    user = User(user_name="myname", email="miintto.log@gmail.com")
    session.add(user)
    session.commit()
    # BEGIN (implicit)
    # INSERT INTO user (username, email) VALUES ('myname', 'miintto.log@gmail.com');
    # COMMIT
```

## 1.1 add

`Session.add()` 메소드는 세션 내에 객체들을 배치하는 역할을 합니다.
**비영속**(transient) 객체, 즉 새로 생성되어 아직 데이터베이스 정보가 없는 객체들은 flush 되는 시점에 INSERT 작업이 수행됩니다.
기존에 세션이 가져왔던 **영속**(persistant) 객체들은 이미 세션 내에 배치되어 있는 상태라 굳이 add 작업을 할 필요가 없습니다.
**준영속**(detached) 객체는 세션과 한 번 연결되었다가 분리된 객체인데 `add()` 메소드를 사용하여 다시 연결할 수 있습니다.

## 1.2 flush

flush가 실행되면 트랜잭션에 있는 변동 내역이 DB에 전송됩니다.
해당 내역은 INSERT, UPDATE, DELETE 같은 내용을 담고 있으나 아직 DB에 반영되지 않은 대기 상태로 존재합니다.

수기로 `Session.flush()`를 호출하여 실행할 수 있지만, 기본적으로 `autoflush=True`로 설정되어 있어서 작업 도중 자동으로 flush가 실행됩니다.
공식 문서에 따르면 다음 조건 하에서 autoflush가 작동합니다.

- `Session.execute()`를 포함한 SQL 실행 메소드 호출 시
- SQL을 데이터베이스로 전송하기 위해 `Query`를 작동시키는 경우
- 데이터베이스에 쿼리를 날리기 전에 `Session.merge()` 메소드 내부에서 작동
- 객체를 refresh 하는 경우
- 아직 데이터를 호출하지 않은 객체에서 ORM lazy-loading이 발생하는 경우

또한 `autoflush` 값과 무관하게 `Session.commit()`메소드 내부 트랜잭션 커밋 전에 작동하며,
`Session.begin_nested()` 호출 시 SAVEPOINT를 생성하기 전에도 반드시 flush가 작동합니다.

## 1.3 commit

`Session.commit()` 메소드는 변동된 내용을 flush 하고 현재 트랜잭션을 커밋합니다.
해당 메소드는 다음 순서대로 작동합니다.

1. COMMIT을 날리기 전에 변동된 내용을 flush 합니다. 
   만일 변동된 내용이 없다면 아무 쿼리도 실행되지 않습니다.
2. 데이터베이스 트랜잭션을 COMMIT 합니다.
3. 트랜잭션이 종료되면 세션 내에 배치되었던 모든 객체들은 정리됩니다.

세션에 영속된 객체에 대한 작업을 종료한 후 커밋은 필수적이지만, SELECT 작업같이 특정한 변화를 주지 않는 단순 조회시에는 굳이 커밋이 필요 없습니다.

아래와 같이 `with session.begin()` 구문을 이용하면 context가 끝나는 시점에 자동으로 커밋되도록 할 수도 있습니다.

```python
with Session(engine) as session:
    with session.begin():
        user = User(user_name="myname", email="miintto.log@gmail.com")
        session.add(user)
    # with 구문 끝날때 session.commit() 실행
# with 구문 끝날때 session.close() 실행
```

## 1.4 close

`Session.close()` 메소드는 세션에 배치되었던 모든 ORM 객체를 제거하고 트랜잭션 및 커넥션 자원을 다시 반납합니다.
커넥션이 커넥션 풀로 반납되면 트랜잭션 상태도 다시 롤백 됩니다.
세션은 종료되고 나면 처음 생성되었을 때의 구성과 동일한 상태로 돌아가서 대부분은 다시 재사용 됩니다.

어떻게 보면 세션의 close 작업은 _"종료"_ 보다는 _"리셋"_ 에 더 가깝습니다.
따라서 롤백이나 커밋 작업을 수행하지 않았더라도 세션의 범위를 제한하기 위해 수행할 작업을 마친 후 `close()` 메소드 호출이 권장됩니다.
다행히도 `Session.__exit__()` 메소드 내부에 세션을 close 하는 부분이 구현되어 있으므로 `with Session()` 구문을 활용한다면 context가 끝나는 시점에 자동으로 `Session.close()`가 호출되도록 프로그래밍할 수 있습니다.

```python
class Session(_SessionClassMethods):
    ...
    def __enter__(self):
        return self

    def __exit__(self, type_, value, traceback):
        self.close()
```

---

# 2. `sessionmaker`

만일 고정된 환경 구성으로 세션을 생성하려는 경우 `sessionmaker`를 활용하면 좋습니다.
마치 동일한 구성을 가진 세션을 찍어내는 factory 기능을 합니다.

```python
class sessionmaker(_SessionClassMethods):
    """A configurable :class:`.Session` factory."""

    def __init__(
        self,
        bind=None,
        class_=Session,
        autoflush=True,
        autocommit=False,
        expire_on_commit=True,
        info=None,
        **kw
    ):
        kw["bind"] = bind
        kw["autoflush"] = autoflush
        kw["autocommit"] = autocommit
        kw["expire_on_commit"] = expire_on_commit
        if info is not None:
            kw["info"] = info
        self.kw = kw
        self.class_ = type(class_.__name__, (class_,), {})

    def __call__(self, **local_kw):
        for k, v in self.kw.items():
            if k == "info" and "info" in local_kw:
                d = v.copy()
                d.update(local_kw["info"])
                local_kw["info"] = d
            else:
                local_kw.setdefault(k, v)
        return self.class_(**local_kw)   # 세션 객체 반환: Session(**local_kw)

```

`sessionmaker.__call__()` 메소드의 결과로 주어진 engine 설정에 부합하는 `Session` 객체를 반환합니다.
해당 기능을 사용하면 매번 DB 연결 정보가 담겨있는 engine 객체로 `Session`을 생성할 필요 없이 글로벌한 위치에서 세션을 정의하고 다른 모듈에서는 해당 세션을 import 하여 사용하는 방식으로 구성할 수 있습니다. 
주로 어플리케이션같이 여러 모듈에서 세션을 반복적으로 사용하는 경우에 활용할 수 있습니다.

```python
# config.py
from sqlalchemy.orm import sessionmaker

engine = create_engine(url="postgresql://user:password@localhost:5432/test_db")
Session = sessionmaker(bind=engine)


# module.py
from my_module.config import Session

with Session() as session:
    session.add(some_object)
    session.commit()

with Session.begin() as session:
    session.add(some_object)
# commit session
```

`Session.begin()`과 동일하게 `sessionmaker.begin()` 메소드도 context 가 끝날 때 자동으로 커밋작업을 수행합니다.

---

# 3. `scoped_session`

웹 어플리케이션을 개발하다보면 어떤 부분에서 세션을 생성하여 어디서 종료하는지와 같은 세션의 생명 주기를 매 request마다 관리해 주어야 합니다.
같은 모듈 내의 작업도 request에 따라 별개로 처리하고, 동일한 request에서는 같은 세션을 사용하도록 하는 등 여러 가지 고려할 사항이 많습니다.
`scoped_session`는 그러한 요구에 맞추어 요청한 클라이언트에 따라 세션을 고정시키는 역할을 합니다.

## 3.1 Usage of `scoped_session`

일반적으로 `Session` 혹은 `sessionmaker`는 독립적인 세션 객체를 만들어냅니다.
아래와 같이 동일한 모듈에서 생성하더라도 생성된 `Session` 객체들은 서로 다른 객체인 것을 확인할 수 있습니다.

```python
from sqlalchemy.orm import Session

session1 = Session(engine)
session2 = Session(engine)
session1 is session2
# False
```

따라서 각 모듈마다 제각각 세션을 생성한다면 모듈 간의 데이터 공유도 까다로워지고 관리할 세션도 늘어나서 비효율적으로 작동하게 됩니다.
하지만 `scoped_session`를 사용하다면 해당 세션이 작업을 마칠 때까지 동일한 세션 객체를 반환하도록 할 수 있습니다.

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker

engine = create_engine(url="postgresql://user:password@localhost:5432/test_db")
session_factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Session = scoped_session(session_factory=session_factory)

session1 = Session()
session2 = Session()
session1 is session2
# True
```

`scoped_session` 클래스는 `__call__` 메소드의 결과값으로 `Session` 객체를 반환합니다.
이때 반환된 객체는 바로 전에 생성하였던 세션 객체와 동일한 객체입니다.
이렇게 `scoped_session`이 클라이언트를 기억할 수 있는 이유는 생성된 세션을 내부 저장소(registry)에 저장하고 요청한 클라이언트에 알맞은 세션을 반환하기 때문입니다.

## 3.2 Registry

`scoped_session` 클래스는 세션을 저장할 때 두 가지 형태의 registry를 사용하는데,
기본적으로 사용하는 **`ThreadLocalRegistry`**와 별도 `scopefunc`를 입력받은 경우 사용하는 **`ScopedRegistry`**가 있습니다.

```python
class scoped_session(ScopedSessionMixin):
    """Provides scoped management of :class:`.Session` objects."""

    def __init__(self, session_factory, scopefunc=None):
        self.session_factory = session_factory
        if scopefunc:
            self.registry = ScopedRegistry(session_factory, scopefunc)
        else:
            self.registry = ThreadLocalRegistry(session_factory)
```

`scopefunc`는 세션의 범위를 구분할 메소드입니다.
해당 메소드는 반드시 해시 가능한 값을 반환해야 하는데, 그 해시값으로 클라이언트를 구분합니다.

```python
class ScopedRegistry(object):
    """A Registry that can store one or multiple instances of a single
    class on the basis of a "scope" function.
    """

    def __init__(self, createfunc, scopefunc):
        self.createfunc = createfunc
        self.scopefunc = scopefunc
        self.registry = {}

    def __call__(self):
        key = self.scopefunc()
        try:
            return self.registry[key]
        except KeyError:
            return self.registry.setdefault(key, self.createfunc())
```

`ScopedRegistry.registry`는 파이썬 dictionary 객체로 구성되어 있으며 해시값을 key로 세션 객체가 저장됩니다.
이러한 구조로 동시에 여러 세션 객체를 관리할 수 있고 클라이언트에 따라 적절한 세션을 반환하게 됩니다.
별다른 `scopefunc`를 정의하지 않으면 `threading.local()`을 사용하여 스레드 단위로 세션이 관리됩니다.

만일 세션을 끝내고 새로운 트랜잭션을 시작하고 싶다면 `scoped_session.remove()`를 호출하면 됩니다.
해당 메소드가 호출되면 세션의 `Session.close()` 작업으로 트랜잭션이 종료된 후, registry에서 해당 세션 객체가 제거됩니다.

## 3.3 Thread-Local

기본적으로 `threading.local()`을 사용하는 이유는 바로 멀티스레딩 이슈 때문입니다.
보통 어플리케이션을 만들다 보면 멀티스레딩을 활용한 성능 향상을 고려하게 되는데, 이러한 환경에서도 스레드마다 독립적인 세션이 보장되어야 합니다.
따라서 각 스레드별 구분된 thread-local storage에 세션을 저장하여 여러 스레드마다 세션이 충돌 나지 않게 됩니다.

다만 동시성을 위해 greenlet, asyncio같은 라이브러리를 사용하는 환경에서는 race condition이 발생할 수 있습니다.
사실 필자가 SQLAlchemy를 학습한 이유가 FastAPI 환경에서 사용하기 위한 목적이었으나 정작 async 환경에서 적용하기에는 여러 위험 요소가 많았습니다.
다행스럽게도 2020년 11월에 1.4 버전이 릴리즈되면서 `AsyncSession`기능이 탑재되었는데 해당 기능에 대해서는 [별도 포스트](/docs/sqlalchemy/2023/03/01/python-sqlalchemy-asyncsession.html)에서 설명하겠습니다.

---

References

- [Using the Session - SQLAlchemy 1.4 Documents](https://docs.sqlalchemy.org/en/14/orm/session.html)
