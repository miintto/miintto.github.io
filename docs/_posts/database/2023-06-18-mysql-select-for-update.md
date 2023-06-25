---
layout: post
title: "InnoDB의 Lock 처리 방식"
category: database
tags:
  - database
  - mysql
  - innodb
  - lock
banner: "/img/posts/mysql-innodb-locking-banner.png"
---

Django ORM 에서는 `select_for_update()` 메소드를 지원하는데, 해당 메소드는 `SELECT .. FOR UPDATE` 쿼리를 생성하여 특정 row 혹은 테이블에 락을 잡아둡니다.
필자가 속한 개발팀의 여러 프로젝트에는 동시성을 제어하기 위해 해당 기술이 적용되어 있습니다.
해당 쿼리가 어떤 기능을 하며 어떤 경우에 활용될 수 있는지 확인해 봅시다.

---

# 1. SELECT FOR UPDATE

먼저 `SELECT FOR UPDATE` 쿼리가 어떤 기능을 하는지부터 알아봅시다.
해당 쿼리가 실행되면 조건절에 걸린 row 혹은 그와 연관된 레코드에 락이 잡히고, 락이 걸린 row에 접근하여 값을 변경하려는 다른 트랜잭션들은 모두 블로킹(blocking) 됩니다.
설정에 따라 타임아웃 시간 동안 락이 해제되기까지 대기하도록 할 수도 있고, 혹은 접근 실패 시 바로 에러를 발생시킬수도 있습니다.
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
이제 id=12인 레코드에 원하는 값을 반영 후 커밋을 하여 변경 내용을 저장합니다.
동시에 공통된 자원에 여러 요청이 몰리는 경우 경쟁 상태를 방지할 수 있습니다.

---

# 2. InnoDB Locking

`SELECT FOR UPDATE` 구문은 MySQL뿐만 아니라 다른 데이터베이스(PostgreSQL, Oracle 등)에서도 사용 가능한 기술입니다.
하지만 각 데이터베이스마다 내부에 구현된 방식에 따라 살짝식 다르게 동작할 수 있습니다.
여기서는 MySQL의 InnoDB 엔진을 기준으로 공식 문서에서 설명하고 있는 동작 원리에 대해 정리하였습니다.

InnoDB에서 사용 가능한 락의 종류는 아래와 같습니다.

## 2.1 Record Locks

**Record lock**은 하나의 인덱스 레코드를 잠궈버리는 락입니다.
간단한 예로 아래 쿼리는 record lock을 발생시킵니다.

```sql
SELECT * FROM t_user WHERE id = 1 FOR UPDATE;
```

위와 같은 쿼리가 실행되었을 때 조건문에 기입한 'user_state' 값이 'admin'에 해당하는 모든 레코드에 대해서 `UPDATE`, `DELETE`, `INSERT` 작업이 불가능합니다.
record lock은 해당 테이블 컬럼들에 인덱스가 설정되어 있는지와는 별개로 작동합니다.

## 2.2 Gap Locks

**Gap lock**은 인덱스 레코드 사이의 gap이나 첫 번째 레코드의 이전, 마지막 레코드 이후와 같은 특정 범위를 대상으로 하는 락입니다.
락이 잡히는 범위에는 하나 이상의 인덱스 레코드가 존재하거나 혹은 비어있는 공간일 수도 있습니다.

아래와 같은 구문이 gap lock의 예시입니다.

```sql
SELECT * FROM t_user WHERE id BETWEEN 10 AND 20 FOR UPDATE;
```

락이 실행되는 동안 나머지 트랜잭션은 id 값이 15인 레코드에 대해 `UPDATE`, `DELETE`, `INSERT` 작업을 할 수 없습니다.
해당 테이블에 id가 15인 레코드가 비어있더라도 `INSERT`가 불가능한데, 해당 공간도 비어있긴 하지만 락의 범위에 포함되어 있기 때문입니다.

유니크 인덱스가 걸려있는 컬럼은 gap lock이 필요하지 않습니다.
해당 값은 반드시 유일하기 때문에 단일 레코드에만 락이 걸리므로 그 근방의 레코드가 변경되는 것을 제어하지 못합니다.

격리 수준을 READ COMMITTED로 내리면 gap lock을 비활성화시킬 수 있습니다.
이 경우 gap lock은 인덱스 스캔 혹은 테이블 스캔시에는 비활성화되고 외래키 체크, 중복키 체크할때만 사용됩니다.

## 2.3 Next-Key Locks

**Next-key lock**은 record lock과  gap lock을 적절하게 조합한 락 입니다.
열린구간(open interval), 닫힌구간(closed interval)들에 대해 복합적으로 락을 걸기 위해 사용됩니다.

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

InnoDB 엔진은 락을 잡을 때 스캔한 모든 row를 대상으로 처리합니다.
이때 InnoDB는 WHERE 절에 어떤 조건이 포함되어 있는지와는 별개로 쿼리 실행으로 스캔한 인덱스 범위만을 기억하고 해당 범위에 락을 잡습니다.
만일 조건절에 준 컬럼이 인덱스가 걸려있지 않다면 테이블 full 스캔으로 레코드를 검색하며, 따라서 테이블 전체에 락이 걸리게 됩니다.

흥미로운 점은 조건문에 unique 인덱스와 unique 검색 조건을 사용하는지 혹은 범위 조건을 사용하는지에 따라 락의 작동 방식이 달라진다는 것입니다.
먼저 unique 인덱스와 unique 검색 조건을 사용하는 경우 발견된 하나의 인덱스 레코드에만 락이 걸립니다.
반면 Unique 조건이 없는 범위 조건을 사용하는 경우 gap lock, next-gap lock을 사용하게 됩니다.

---

References

- [MySQL 8.0 Reference Manual :: 15.7.2.4 Locking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)
- [MySQL 8.0 Reference Manual :: 15.7.1 InnoDB Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html)
- [MySQL 8.0 Reference Manual :: 15.7.3 Locks Set by Different SQL Statements in InnoDB](https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-set.html)
- [SELECT FOR UPDATE holding entire table in MySQL rather than row by row - Stack Overflow](https://stackoverflow.com/questions/22242081/select-for-update-holding-entire-table-in-mysql-rather-than-row-by-row)
- [MySQL InnoDB lock & deadlock 이해하기 - Knowledge Logger](https://www.letmecompile.com/mysql-innodb-lock-deadlock/)
