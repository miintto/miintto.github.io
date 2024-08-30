---
layout: post
title: "Django의 DB 커넥션 관리"
category: django
tags:
  - django
  - connection pool
  - persistent connections
thumbnail: "/img/thumbnails/django.png"
---

Django 혹은 Spring 같은 웹프레임워크를 사용하여 어플리케이션을 구축하는 경우 대부분 데이터베이스 연동이 필요한데, 각 프레임워크마다 효율적으로 데이터베이스 커넥션을 관리하기 위해 여러 기술을 사용하고 있습니다.

가장 많이 사용되는 기술은 커넥션 풀링 기법입니다.
여러 JDBC 기반 라이브러리나 SQLAlchemy 에서는 해당 방식으로 데이터베이스 연결을 관리하고 있습니다.
반면 Django는 커넥션 풀 기능을 지원하지 않으며 대신 Persistent Connections 방식을 채택하여 커넥션 수명 주기를 관리합니다.
아래에서 Django를 중심으로 커넥션을 관리하는 방법을 정리해 보았습니다.

---

# 1. Connection Pooling

**커넥션 풀링**(Connection Pooling)이란 데이터베이스와 연결된 객체를 미리 일정 개수만큼 생성하여 풀(Pool)에 저장해 두었다가, 데이터베이스와 상호작용이 필요할 때마다 풀에서 가져와 사용하는 기법입니다.
이러한 방식을 사용하면 데이터베이스 통신 과정에서의 발생하는 오버헤드를 줄일 수 있습니다.

<img src="/img/posts/django-db-connection-3-way-handshake.png" style="max-width:480px"/>

일반적으로 어플리케이션은 데이터베이스와 통신할 때 TCP/IP 프로토콜을 사용합니다.
TCP 통신은 3-way Handshaking 절차를 거치며 서버와 클라이언트가 서로를 검증한 후에 실시간 통신을 진행하게 되는데,
만약 어플리케이션으로 요청이 발생할 때마다 데이터베이스와 TCP 통신을 시작하게 된다면 불필요하게 통신 시간이 길어질 수 있습니다.
이때 데이터베이스와 미리 통신이 이루어진 커넥션을 계속 재사용한다면 매번 통신을 시작하는 오버헤드를 줄이고 응답 시간을 단축할 수 있습니다.

풀에 담겨있는 커넥션 객체들은 데이터베이스와 3-way Handshaking 과정이 완료되어 곧바로 가져와 데이터베이스와 통신이 가능한 상태입니다.
새로운 요청이 들어와 데이터베이스 작업이 필요한 경우 커넥션 풀에서 유휴 커녁션(Idle Connection)을 할당받아 사용합니다.
사용이 끝나면 연결을 종료하지 않고 다시 커넥션 풀에 반환하여 재사용할 수 있게 합니다.

여러 라이브러리에서 커넥션 풀 기능을 지원하고 있습니다.
Spring에서는 HikariCP를 사용하여 어플리케이션 실행 시 `minimumIdle` 개수만큼 커넥션을 만들고 `maximumPoolSize` 값으로 커넥션 개수를 조절할 수 있습니다.
SQLAlchemy에서도 엔진 생성 시에 커넥션 개수를 조정하기 위해 `pool_size`, `max_overflow` 인자를 사용할 수 있습니다.

---

# 2. Persistent Connections

Django 에서는 커넥션 풀링 대신 **Persistent Connections**(지속 연결) 방식으로 커넥션을 관리하는데, 한 번 연결한 커넥션을 곧바로 종료하지 않고 일정 시간이 지난 후에 종료되도록 하여 이어지는 요청에서도 커넥션을 재사용하도록 합니다.

## 2.1 Settings

커넥션의 수명 주기는 세팅 파일에서 `CONN_MAX_AGE` 옵션으로 조정할 수 있습니다.
Integer 타입으로 초 단위로 설정할 수 있으며 따로 정의하지 않는 경우에는 기본적으로 0으로 설정됩니다.

아래와 같이 데이터베이스마다 커넥션 수명 주기를 설정할 수 있습니다.

```python
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "database",
        "USER": "user",
        "PASSWORD": "password",
        "HOST": "localhost",
        "PORT": "5432",
        "CONN_MAX_AGE": 60,  # 최대 수명 시간 (초 단위)
    }
}
```

기본값이 0이므로 별다른 설정을 하지 않는다면 매 요청마다 커넥션을 연결하고 종료하게 됩니다.
`CONN_MAX_AGE` 값을 `None`으로 설정하는 경우에는 해당 커넥션을 끊지 않고 계속 연결합니다.


## 2.2 Lifecycle

Django는 기본적으로 스레드(Thread)마다 데이터베이스 커넥션을 관리합니다.
웹 서버가 여러 스레드를 사용하여 요청을 처리하는 경우 스레드마다 데이터베이스 커넥션이 생성되며, 스레드 간에는 커넥션이 공유되지 않습니다.

<img src="/img/posts/django-db-connection-lifecycle.png" style="max-width:480px"/>

커넥션은 최초 쿼리를 실행할 때 생성되며, `CONN_MAX_AGE` 값을 기반으로 해당 커넥션의 수명이 설정됩니다.
이후 데이터베이스 통신이 필요할 때도 해당 커넥션을 계속 사용합니다.

수명이 다한 커넥션을 종료하는 작업은 signal에 등록되어 있어서 미들웨어 스택에 진입하기 전에 한 번, 종료될 때 한 번씩 실행됩니다.
해당 시점에 커넥션의 수명이 끝난 경우나 데이터베이스 처리 중 에러가 발생하여 다시 재사용할 수 없다고 판단되는 경우 커넥션을 종료합니다.
이러한 방식으로 특정 커넥션에 문제가 발생하더라도 다음 요청에서는 새로운 커넥션을 사용하게 되어 에러의 영향을 받지 않게 됩니다.

어떻게 보면 커넥션 풀링 기법과 많은 점에서 유사합니다.
생성된 커넥션을 각 스레드마다 관리하는 것과 풀에서 한 번에 관리하는 방식의 차이일 뿐이지 한 번 연결된 객체를 종료하지 않고 재사용하여 매번 커넥션을 여닫는 비용을 줄인다는 원리는 동일합니다.
오히려 커넥션을 각 스레드에서 관리하기 때문에 커넥션을 할당받고 반환하는 작업이 생략되어 커넥션 풀링보다 더 효율적인 경우도 있습니다.

만약 많은 트래픽이 유입되어 데이터베이스 연결이 빈번해지는 경우 `CONN_MAX_AGE` 값을 잘 조절하면 매 요청마다 커넥션을 생성하는 비효율을 줄일 수 있습니다.
하지만 커넥션 수명 주기를 늘릴수록 많은 연결을 유지해야 하는 데이터베이스의 부하가 커지게 됩니다.
따라서 데이터베이스 사양과 요청 트래픽 및 여러 조건을 고려하여 적절한 수치를 찾아야 합니다.

## 2.3 Source

Django 내부에서는 아래와 같이 구현되어 있습니다.

```python
# django/db/backends/base/base.py
class BaseDatabaseWrapper:
    ...

    @async_unsafe
    def connect(self):
        """데이터베이스 연결
        """
        ...

        self.health_check_enabled = self.settings_dict["CONN_HEALTH_CHECKS"]
        max_age = self.settings_dict["CONN_MAX_AGE"]
        self.close_at = None if max_age is None else time.monotonic() + max_age

        ...

    def close_if_unusable_or_obsolete(self):
        """에러가 발생하거나 수명이 다한 경우 현재 커넥션 종료 처리
        """
        if self.connection is not None:
            self.health_check_done = False
            # 어플리케이션의 autocommit 설정이 복원되지 않았다면 곧바로 커넥션 종료
            if self.get_autocommit() != self.settings_dict["AUTOCOMMIT"]:
                self.close()
                return

            # 지난 커밋이나 롤백 과정에서 에러가 발생한 경우 커넥션이 동작하는지 검증
            if self.errors_occurred:
                if self.is_usable():
                    self.errors_occurred = False
                    self.health_check_done = True
                else:
                    self.close()
                    return

            if self.close_at is not None and time.monotonic() >= self.close_at:
                self.close()
                return
```

`BaseDatabaseWrapper` 클래스는 데이터베이스의 연결을 관리하는 구현체입니다.
트랜잭션 커밋, 롤백 등과 같은 기본적인 기능을 제공하며, Oracle이나 MySQL, PostgreSQL 등의 데이터베이스마다 해당 클래스를 상속받아 구체적인 구현을 제공합니다.

`CONN_HEALTH_CHECKS` 값을 `True`로 설정하면 커넥션을 재사용할 때마다 `SELECT 1` 실행(PostgreSQL) 혹은 핑(Ping) 테스트(Oracle, MySQL)를 진행하면서 커넥션이 유효하지 않다고 판단되는 경우 종료 처리합니다.

데이터베이스와 최초 연결하는 시점에 `connect()` 함수가 실행되어 `CONN_MAX_AGE` 값을 기반으로 종료 시점이 계산됩니다.
그리고 `close_if_unusable_or_obsolete()` 함수는 커넥션 종료 처리를 담당합니다.

```python
# django/db/__init__.py
def close_old_connections(**kwargs):
    for conn in connections.all(initialized_only=True):
        conn.close_if_unusable_or_obsolete()

signals.request_started.connect(close_old_connections)
signals.request_finished.connect(close_old_connections)
```

종료 처리 함수는 `signals.request_started`에 등록되어 요청이 어플리케이션에 진입하여 미들웨어 스택 실행 전에 처리됩니다.
또한 `signals.request_finished`에도 등록되어 있어서 요청이 끝나기 전에 한 번 더 처리됩니다.

---

References

- [Databases \| Django documentation \| Django](https://docs.djangoproject.com/en/5.0/ref/databases/#persistent-connections)
- [Django에서 DB Connection 관리   오늘보다 내일 더 잘하는 개발자](https://seungho-jeong.github.io/technology/computer-science/django-db-connections/)
- [Spoqa 기술 블로그 \| SQLAlchemy의 연결 풀링 이해하기](https://spoqa.github.io/2018/01/17/connection-pool-of-sqlalchemy.html)
- [Database pooling vs. persistent connections](https://groups.google.com/g/django-developers/c/NwY9CHM4xpU)
