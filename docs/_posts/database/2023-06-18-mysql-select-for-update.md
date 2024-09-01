---
layout: post
title: "InnoDB의 Lock 처리 방식"
category: database
tags:
  - database
  - mysql
  - innodb
  - lock
toc: true
thumbnail: "/img/thumbnails/mysql-innodb-locking.png"
---

필자가 속한 개발팀의 여러 Django 프로젝트에서는 데이터베이스의 동시성을 제어하기 위해 `select_for_update()` 메소드가 적용되어 있습니다. 
비슷하게 SQLAlchemy 라이브러리에서는 `with_for_update()` 메소드로 사용 가능합니다.

이러한 기능은 프레임워크가 아닌 데이터베이스 자체에서 지원하는 기능이라 특정 언어나 라이브러리에 구애받지 않고 사용할 수 있습니다.
위에서 언급한 메소드들은 공통적으로 `SELECT .. FOR UPDATE` 쿼리를 생성하는데, 특정 row 혹은 테이블에 락을 잡아두어 다른 트랜잭션이 락을 잡아둔 레코드에 접근하지 못하도록 합니다.

상식적으로 해당 쿼리가 실행되는 경우 특정 레코드에만 락이 걸리길 바라겠지만, 어떤 경우에는 조건절을 적절히 주었음에도 불구하고 테이블 전체에 락이 잡혀 버리기도 합니다.
그렇다면 해당 쿼리가 락을 획득할 때 어떤 방식으로 동작하며, 테이블 락이 잡힌 경우에는 왜 그러한 현상이 발생했는지 MySQL의 InnoDB 기준으로 살펴봅시다.

---

# 1. SELECT FOR UPDATE

먼저 `SELECT FOR UPDATE` 쿼리가 어떤 기능을 하는지부터 알아봅시다.
해당 쿼리가 실행되면 조건절에 걸린 row 혹은 그와 연관된 레코드에 락이 잡히고, 락이 걸린 row에 접근하여 값을 변경하려는 다른 트랜잭션들은 모두 블로킹(blocking) 됩니다.
설정에 따라 타임아웃 시간 동안 락이 해제되기까지 대기하도록 할 수도 있고, 혹은 접근 실패 시 바로 에러를 발생시킬 수도 있습니다.
다만, 레코드의 이전 버전에 대해서는 락이 잡히지 않으므로 `SELECT`와 같은 단순 조회 쿼리는 락과 무관하게 레코드에 접근하여 데이터를 읽어갈 수 있습니다.

락을 점유한 트랜잭션이 커밋되거나 롤백 되면 락은 해제되어 다시 여러 트랜잭션이 해당 레코드에 접근할 수 있게 됩니다.
만일 autocommit 설정이 켜져 있다면 쿼리가 실행되자마자 커밋되어 lock이 원하는 대로 동작하지 않을 수 있습니다.
autocommit을 비활성화 시키거나 `START TRANSACTION` 구문을 사용하여 클라이언트가 원하는 시점에 커밋 혹은 롤백 되도록 합니다.

구체적인 사용 예시를 들어보겠습니다.
회원 테이블 `t_user` 가 있고 한 사용자가 프로필을 변경하는 동안 다른 요청은 해당 레코드에 접근하지 못하게 하려고 합니다.
동시성 이슈를 해결하기 위해 아래와 같이 트랜잭션을 제어할 수 있습니다.

```sql
START TRANSACTION;

SELECT * FROM t_user WHERE id = 12 FOR UPDATE;  -- 해당 row에 락 점유

UPDATE t_user SET user_email = 'test@test.com' WHERE id = 12;  -- 락을 점유한 트랜잭션에서만 레코드 변경 가능

COMMIT;
```

먼저 트랜잭션을 시작하여 발생한 SQL이 자동으로 커밋되지 않도록 합니다.
그 후 조건절에 해당하는 row에 락을 걸어 다른 트랜잭션의 접근을 차단합니다.
이제 해당 레코드에 원하는 값을 수정한 후 커밋을 하여 변경 내용을 반영합니다.
이런 방식을 이용하면 공통된 자원에 여러 요청이 몰리는 경우 경쟁 상태를 방지하여 순차적으로 작업을 진행할 수 있습니다.

---

# 2. InnoDB Locking

`SELECT FOR UPDATE` 구문은 MySQL뿐만 아니라 다른 데이터베이스(PostgreSQL, Oracle 등)에서도 사용 가능한 기술입니다.
하지만 각 데이터베이스마다 내부에 구현된 방식에 따라 살짝씩 다르게 동작할 수 있습니다.
여기서는 MySQL의 InnoDB 엔진을 기준으로 공식 문서에서 설명하고 있는 동작 원리에 대해 정리하였습니다.

InnoDB에서 동작하는 락의 종류는 아래와 같습니다.

## 2.1 Record Locks

**Record lock**은 하나의 인덱스 레코드를 잠궈버리는 락입니다.
간단한 예로 아래 쿼리는 record lock을 발생시킵니다.

```sql
SELECT * FROM t_user WHERE id = 1 FOR UPDATE;
```

위와 같은 쿼리가 실행되었을 때 조건문에 기입한 'id' 값이 `1`에 해당하는 모든 레코드에 대해서 `UPDATE`, `DELETE`, `INSERT` 작업이 불가능합니다.
record lock은 해당 테이블 컬럼들에 인덱스가 설정되어 있는지와는 별개로 작동합니다.

## 2.2 Gap Locks

**Gap lock**은 실제 레코드가 아니라 레코드 사이 공간을 대상으로 하는 락입니다.
해당 공간은 하나 이상의 인덱스 레코드 간격이거나 혹은 비어있을 수도 있습니다.

아래와 같은 구문을 생각해 봅시다.

```sql
SELECT * FROM t_user WHERE id BETWEEN 10 AND 20 FOR UPDATE;
```

락이 실행되는 동안 나머지 트랜잭션은 id 값이 15인 레코드에 대해 `UPDATE`, `DELETE`, `INSERT` 작업을 할 수 없습니다.
심지어 id가 15인 레코드가 존재하지 않더라도 `INSERT`가 불가능한데, 해당 공간이 비어있긴 하지만 락의 범위에 포함되어 있기 때문입니다.
이런 식으로 gap lock은 특정 공간에 `INSERT` 작업을 방지하는 것을 최우선 목표로 합니다.

Unique 인덱스가 걸려있는 컬럼은 gap lock이 필요하지 않습니다.
해당 값은 반드시 유일하기 때문에 단일 레코드에만 락이 걸리므로 그 근방의 레코드가 변경되는 것과는 무관합니다.

격리 수준을 READ COMMITTED로 내리면 gap lock을 비활성화시킬 수 있습니다.
이 경우 gap lock은 인덱스 스캔 혹은 테이블 스캔 시에는 비활성화되고 외래키 체크, 중복키 체크할 때만 사용됩니다.

## 2.3 Next-Key Locks

**Next-key lock**은 record lock과  gap lock을 적절하게 조합한 락 입니다.

먼저 조건문에 해당하는 row에 락을 잡기 위해 구간을 스캔한 후에 해당하는 인덱스 레코드에 대해 락을 획득합니다.
추가적으로 레코드의 바로 이전 공간에 대해서도 락을 획득하여 gap lock의 역할도 수행합니다.
즉 인덱스순으로 처음 레코드를 발견했을 때 바로 이전 공간 및 조건 구간의 어떤 빈 공간에 대해서도 `INSERT` 작업이 불가능합니다.

간단한 예를 들어봅시다.
테이블에 id 값이 1, 8, 12, 13, 16인 레코드만 들어있다고 가정하고, 아래 쿼리를 실행하여 락을 걸어줍니다.

```sql
SELECT * FROM t_user WHERE id > 10 FOR UPDATE;
```

위 쿼리 구문으로 조회된 레코드에는 record lock이 걸리고, 사이 빈 공간에는 gap lock이 걸립니다.
이때 id=11인 값은 물론이고 조건 범위에 해당하지 않는 id=9에 해당하는 레코드까지도 `INSERT` 작업이 수행될 수 없습니다.

<img src="/img/posts/mysql-innodb-locking-next-key-lock.png" style="max-width:540px"/>

InnoDB의 디폴트 격리 수준 REPEATABLE READ에서는 phantom row를 방지하기 위해 기본적으로 next-key lock을 이용하여 락을 획득합니다.
하지만 gap lock을 비활성화 한 경우 next-key lock을 사용할 수 없습니다.

---

# 3. 락 동작 규칙

## 3.1 조건 컬럼엔 인덱스를 걸자

InnoDB 엔진은 락을 잡을 때 스캔한 모든 row를 대상으로 처리합니다.
이때 InnoDB는 WHERE 절에 어떤 조건이 포함되어 있는지와는 별개로 쿼리 실행으로 스캔한 인덱스 범위만을 기억하고 해당 범위에 락을 잡습니다.
만일 조건절에 준 컬럼이 인덱스가 걸려있지 않다면 테이블 full 스캔으로 레코드를 검색하며, 결국 테이블 전체에 락이 걸리게 됩니다.

제일 처음에 언급했던 적절한 조건을 주었음에도 테이블 전체에 락이 잡히게 된 이유는 여기서 확인할 수 있습니다.
바로 조건절에 해당하는 컬럼에 인덱스가 걸려있지 않았기 때문입니다.
따라서 테이블 전체가 아닌 특정 레코드에만 락이 잡히게 하려면 실행되는 쿼리를 잘 분석하여 적절하게 인덱스를 설계해야 합니다.

## 3.2 Unique 조건을 준 경우

조건문에 unique 검색 조건을 사용하는지 혹은 범위 검색 조건을 사용하는지에 따라 락의 작동 방식이 달라질 수 있습니다.
Unique 인덱스와 unique 검색 조건을 사용하는 경우 발견된 하나의 인덱스 레코드에만 락이 걸립니다.
반면 unique 조건이 없는 경우 gap lock 혹은 next-key lock을 사용하게 됩니다.

따라서 컬럼에 인덱스를 생성해 주었더라도 unique 여부에 따라 다른 방식으로 동작할 수 있습니다.
예시로 아래 쿼리를 생각해 봅시다.

```sql
SELECT * FROM t_user WHERE id = 8 FOR UPDATE;
```

<img src="/img/posts/mysql-innodb-locking-unique-condition.png" style="max-width:720px"/>

만일 해당 쿼리에서 `id` 컬럼이 primary key이거나 혹은 unique 설정이 되어있다면 해당 레코드에만 락이 잡히게 됩니다.
이때 락이 잡힌 단일 레코드 외에 다른 row에 대해서는 자유롭게 `UPDATE`, `DELETE`, `INSERT` 작업이 가능합니다.

하지만 `id` 컬럼이 unique 조건 없이 인덱스가 설정되어 있다면 쿼리 실행시 range 스캔을 하게 되고 gap lock이 발생하게 됩니다.
결국 직접 조건을 주었던 id=8 레코드 외에도 그 근방에 있는 빈 공간에도 락이 걸려서 id=5 혹은 id=11과 같이 gap lock의 범위에 포함된 공간에 대해서는 `INSERT` 작업이 불가능하게 됩니다.

---

References

- [MySQL 8.0 Reference Manual :: 15.7.1 InnoDB Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html)
- [MySQL 8.0 Reference Manual :: 15.7.2.4 Locking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)
- [MySQL 8.0 Reference Manual :: 15.7.3 Locks Set by Different SQL Statements in InnoDB](https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-set.html)
- [SELECT FOR UPDATE holding entire table in MySQL rather than row by row - Stack Overflow](https://stackoverflow.com/questions/22242081/select-for-update-holding-entire-table-in-mysql-rather-than-row-by-row)
- [MySQL InnoDB lock & deadlock 이해하기 - Knowledge Logger](https://www.letmecompile.com/mysql-innodb-lock-deadlock/)
