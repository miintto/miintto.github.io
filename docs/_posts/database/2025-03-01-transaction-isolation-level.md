---
layout: post
title: 트랜잭션의 격리 수준
category: database
tags:
  - database
  - transaction
  - isolation-level
  - mvcc
toc: true
thumbnail: "/img/thumbnails/transaction-isolation-level.png"
---

# 1. 트랜잭션이란?

**트랜잭션**(Transaction)이란 데이터베이스 시스템에서 이루어지는 논리적인 작업 단위로, 내부에 여러 연산을 포함하고 있습니다.
보통 `BEGIN`, `START TRANSACTION` 등의 구문으로 트랜잭션을 시작하고, 그 안에서 `SELECT`, `INSERT`와 같은 SQL 작업을 수행할 수 있습니다.
작업이 완료되면 `COMMIT` 혹은 `ROLLBACK`으로 변경 내용을 반영한 후 트랜잭션이 종료됩니다.

트랜잭션은 아래 4가지 속성(ACID)을 가지고 있습니다.
이러한 속성으로 데이터베이스 트랜잭션이 안전하게 수행되도록 보장할 수 있습니다.

- **원자성(Atomicity)**: 트랜잭션 내의 모든 작업은 하나의 단위로 취급하여 완전히 실행되거나 혹은 전혀 실행되지 않습니다. 일부분만 반영되는 상황은 발생하지 않습니다.
- **일관성(Consistency)**: 트랜잭션 실행 후에도 데이터베이스의 무결성이 유지됩니다.
- **격리성(Isolation)**: 여러 트랜잭션이 동시에 실행되더라도 서로 영향을 주지 않습니다. 동시에 동일한 데이터에 접근할 때, 서로의 작업이 충돌하지 않도록 보장해야 합니다.
- **영속성(Durability)**: 성공적으로 커밋된 변경 사항은 데이터베이스에 영구적으로 저장됩니다.

---

# 2. 트랜잭션의 격리 수준이란?

트랜잭션의 **격리 수준**(Isolation Level)이란 여러 트랜잭션이 동시에 실행되는 경우, 트랜잭션끼리 서로 영향을 주지 않도록 격리하는 정도를 설정하는 값 입니다.
데이터베이스에서는 동시에 여러 트랜잭션이 실행될 수 있기 때문에, 격리 수준을 설정하여 데이터의 무결성을 보장할 수 있습니다.
다만, 격리 수준이 높아질수록 데이터의 일관성은 높아지지만 데이터베이스의 성능이 낮아질 수 있으므로 적절하게 설정해 주어야 합니다.

데이터베이스에 따라 다르지만 보통 아래 4가지 격리 수준을 정의하고 있습니다.
아래로 내려갈 수록 격리 수준이 높아집니다.

- **READ UNCOMMITTED**
  - 커밋되지 않은 변경사항을 다른 트랜잭션이 읽도록 허용합니다.
- **READ COMMITTED**
  - 커밋된 데이터만 읽을 수 있습니다. 다만, 다른 트랜잭션이 수정 후 커밋한 경우 동일한 데이터를 조회하더라도 다른 결과가 나올 수 있습니다.
- **REPETEAD READ**
  - 같은 트랜잭션에서는 같은 데이터를 여러 번 읽어도 값이 변하지 않습니다. 하지만 하지만 새로운 데이터가 삽입되는 것은 막지 않습니다.
- **SERIALIZABLE**
  - 가장 높은 격리수준으로 강하게 일관성을 유지해야 하는 경우에 사용합니다. 모든 트랜잭션을 직렬화(순차적 실행)하여 서로 충돌하지 않도록 합니다.

---

# 3. Dirty Read

**Dirty Read**란 커밋되지 않은 데이터를 다른 트랜잭션에서 읽어버리는 현상을 말합니다.
즉, 한 트랜잭션에서 변경한 데이터를 아직 확정(Commit)하지 않았지만, 다른 트랜잭션에 그 데이터를 읽어버리는 경우를 말합니다.
이러한 상황에서 롤백이 발생했을 때 트랜잭션에서 읽은 데이터가 사라지면서 일관성이 깨질 수 있습니다.

아래와 같이 한 계좌에 1000원을 입금하는 경우를 가정해봅시다

<img src="/img/posts/transaction-isolation-level-dirty-read.png" style="max-width:600px"/>

1. 트랜잭션 A에서 1번 계좌에 1000원을 추가하고 아직 커밋이 이루어지지 않았습니다.
2. 그 사이 트랜잭션 B에서 같은 데이터를 읽습니다. 이 때 격리 수준이 READ UNCOMMITTED라면 커밋되지 않은 데이터를 읽을 수 있기 때문에 5000원으로 읽게 됩니다.
3. 트랜잭션 A에서 롤백이 발생했고 업데이트 작업이 취소됩니다.

이 경우 실제 데이터와 B 트랜잭션이 읽은 데이터가 일치하지 않는 상황이 발생할 수 있습니다.
이러한 Dirty Read를 방지하려면 READ COMMITTED 이상의 격리 수준 설정이 필요합니다.

## 3.1 MySQL(InnoDB)의 Undo 로그

MySQL의 InnoDB는 데이터가 변경되는 경우 **Undo 로그**에 변경 전 데이터를 기록합니다.
만일 트랜잭션이 롤백된다면 Undo 로그의 데이터를 사용하여 복원할 수 있으며, 이렇게 데이터를 여러 버전으로 관리하면서 여러 트랜잭션간의 접근 가능한 데이터를 제어할 수 있습니다.

InnoDB의 격리 수준이 READ COMMITTED나 REPEATABLE READ로 설정된 경우에는 트랜잭션이 실행될 때 **Read View**를 생성합니다.
Read View는 트랜잭션이 접근할 수 있는 데이터의 ID 목록을 관리하는 메타데이터 구조체로 현재 트랜잭션이 볼 수 있는 데이터의 스냅샷 역할을 합니다.
트랜잭션에서 데이터를 읽는 경우 Read View의 생성 시점과 데이터의 커밋 시점을 비교하게 되는데, 만일 Read View 생성 이후에 커밋되었다면 Undo 로그를 참조하여 데이터를 조회합니다.

트랜잭션이 커밋되면 Undo 로그는 정리되며, 새로운 트랜잭션이 접근하는 경우에 Undo 로그를 참조하지 않습니다.
`innodb_undo_log_truncate` 옵션으로 Undo 로그를 자동으로 정리하도록 설정할 수 있습니다.

<img src="/img/posts/transaction-isolation-level-mysql-undo-log.png" style="max-width:600px"/>

## 3.2 PostgreSQL의 버전 관리

PostgreSQL은 MySQL과는 다르게 별도 Undo 로그가 아닌 테이블 공간에 여러 버전을 저장합니다.
Write 요청이 들어오면 기존 공간이 아닌 별도 테이블 공간을 할당받아 새로운 버전의 데이터를 기록하는데, 트랜잭션은 최신 버전을 참조하여 데이터를 읽게 됩니다.
(자세한 내용은 [PostgreSQL의 MVCC](/docs/postgres-vacuum#2-다중-버전-동시성-제어-mvcc) 참조.)

<img src="/img/posts/transaction-isolation-level-postgresql-mvcc.png" style="max-width:600px"/>

사실상 PostgreSQL에서는 항상 Dirty Read가 발생하지 않으며, 커밋되지 않은 데이터를 읽을 수 없으므로 격리 수준을 READ UNCOMMITTED로 설정하더라도 READ COMMITTED와 동일하게 동작합니다.

---

# 4. Non-Repeatable Read

**Non-Repeatable Read**는 같은 트랜잭션 내에서 같은 데이터를 여러 번 조회했을 때 값이 달라지는 현상을 말합니다.
한 트랜잭션이 데이터를 읽는 도중 다른 트랜잭션이 동일한 데이터를 변경 후 커밋한다면 결과가 달라질 수 있습니다.
Dirty Read가 커밋되지 않은 데이터 때문에 발생한다면, 반대로 Non-Repeatable Read는 커밋된 데이터 때문에 발생합니다.

다시 아래에서 계좌를 조회하면서 동시에 1000원을 입금하는 상황을 가정해봅시다.

<img src="/img/posts/transaction-isolation-level-non-repeatable-read.png" style="max-width:600px"/>

1. 트랜잭션 A에서 고객의 잔액을 조회합니다.
2. 트랜잭션 B에서는 1번 계좌에 1000원이 입금되어 잔액이 변경됩니다.
3. 같은 데이터를 다시 조회하는 경우 값이 변경되어 있습니다.

REPEATABLE READ 이상의 격리 수준<i>(REPETEAD READ, SERIALIZABLE)</i>을 사용하면 Non-Repeatable Read가 발생하는 것을 방지할 수 있습니다.

InnoDB 에서는 격리 수준이 REPEATABLE READ인 경우 트랜잭션이 시작될 때만 Read View를 생성합니다.
즉, 처음 생성한 Read View를 트랜잭션이 종료될 때까지 유지하면서 트랜잭션 실행중에 다른 트랜잭션이 커밋한 데이터는 무시하게 됩니다.

PostgreSQL도 유사합니다.
REPEATABLE READ에서는 SELECT 시점이 아닌 현재 트랜잭션이 시작되기 전의 버전만 참조합니다.
따라서 같은 트랜잭션에서는 동일한 SELECT를 실행해도 결과가 바뀌지 않습니다.

> 이와 별개로 `SELECT .. FOR UPDATE` 쿼리를 사용해서 Non-Repeatable Read를 방지할 수도 있습니다.
> 해당 방식은 특정 데이터에 Lock을 걸어서 다른 트랜잭션이 데이터를 변경할 수 없도록 합니다.

---

# 5. Phantom Read

**Phantom Read**는 같은 트랜잭션 내에서 동일한 조건으로 여러 번 조회했을 때, 새로운 행이 추가되거나 삭제되어 결과가 달라지는 현상을 말합니다.
즉, 한 트랜잭션이 특정 조건으로 데이터를 조회한 후에, 다른 트랜잭션이 데이터를 추가하거나 삭제하고 커밋하게 되면, 같은 조건으로 다시 조회했을 때 결과가 달라지는 문제가 발생합니다.

아래에서 사용자 테이블에 새로운 데이터를 추가하는 상황을 가정해봅시다.

<img src="/img/posts/transaction-isolation-level-phantom-read.png" style="max-width:600px"/>

1. 먼저 트랜잭션 A에서 admin 타입의 사용자를 조회합니다.
2. 그리고 트랜잭션 B에서는 새로 admin 직원을 추가하였습니다.
3. 트랜잭션 A에서 같은 조건으로 조회했더니 처음에는 없던 사용자가 나타나게 됩니다.

이때 격리 수준을 SERIALIZABLE 으로 설정하면 Phantom Read를 방지할 수 있습니다.

InnoDB의 SERIALIZABLE에서는 모든 SELECT 문이 `FOR UPDATE` 혹은 `LOCK IN SHARE MODE` 작업이 적용된 것처럼 작동합니다.
따라서 다른 트랜잭션에서 동일한 레코드를 읽는건 가능하지만 변경하려고 한다면 충돌이 발생하게 됩니다.
만일 SELECT 작업에서 range scan이 발생하게 된다면(ex. `WHERE balance > 1000`) 조회한 레코드 범위에 [Next-Key Lock](/docs/mysql-select-for-update#23-next-key-locks)이 작동하고, 다른 트랜잭션에서 해당 범위에 대한 INSERT 작업도 충돌이 일어납니다.

PostgreSQL는 REPEATABLE READ에서도 Phantom Read가 발생하지 않습니다.
위에서 설명했다시피 트랜잭션이 시작되기 이전의 버전만 참조하기 때문에 다른 트랜잭션이 INSERT한 새로운 레코드는 현재 트랜잭션에서 접근할 수 없습니다.

---

다음과 같이 정리할 수 있습니다.

MySQL에서는 아래와 같고,

| 격리 수준 | Dirty Read | Non-Repeatable Read | Phantom Read
|---|---|---|---
| **READ UNCOMMITTED** | ⚠️ 발생 가능 | ⚠️ 발생 가능 | ⚠️ 발생 가능
| **READ COMMETTED** | ✅ 방지 | ⚠️ 발생 가능 | ⚠️ 발생 가능
| **REPETEAD READ** | ✅ 방지 | ✅ 방지 | ⚠️ 발생 가능
| **SERIALIZABLE** | ✅ 방지 | ✅ 방지 | ✅ 방지

PostgreSQL 기준으로는 아래와 같습니다.

| 격리 수준 | Dirty Read | Non-Repeatable Read | Phantom Read
|---|---|---|---
| **READ COMMETTED** | ✅ 방지 | ⚠️ 발생 가능 | ⚠️ 발생 가능
| **REPETEAD READ** | ✅ 방지 | ✅ 방지 | ✅ 방지
| **SERIALIZABLE** | ✅ 방지 | ✅ 방지 | ✅ 방지

---

References
- [데이터베이스 트랜잭션 - 위키백과, 우리 모두의 백과사전](https://ko.wikipedia.org/wiki/%EB%8D%B0%EC%9D%B4%ED%84%B0%EB%B2%A0%EC%9D%B4%EC%8A%A4_%ED%8A%B8%EB%9E%9C%EC%9E%AD%EC%85%98){:target="_blank"}
- [Isolation (database systems) - Wikipedia](https://en.wikipedia.org/wiki/Isolation_(database_systems)){:target="_blank"}
- [PostgreSQL: Documentation: 17: 13.2. Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html){:target="_blank"}
- [RDS MySQL 과 Aurora MySQL 에서 Innodb purge 작업 최적화 하기 \| AWS 기술 블로그](https://aws.amazon.com/ko/blogs/tech/achieve-a-high-speed-innodb-purge-on-amazon-rds-for-mysql-and-amazon-aurora-mysql/){:target="_blank"}
- [트랜잭션 격리 이야기에서 팬텀 읽기 현상: 한국 포스트그레스큐엘 홈페이지](https://postgresql.kr/blog/pg_phantom_read.html){:target="_blank"}
- [[MySQL] 트랜잭션의 격리 수준(Isolation Level)에 대해 쉽고 완벽하게 이해하기 - MangKyu's Diary](https://mangkyu.tistory.com/299){:target="_blank"}
