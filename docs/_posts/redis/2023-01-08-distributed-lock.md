---
layout: post
title: "Redis 분산 락을 활용한 동시성 처리"
date: 2023-01-08
category: database
tags:
  - distributed lock
  - redis
  - spin lock
  - redisson
banner: "/img/posts/distributed-lock-banner.png"
---

유명 가수 콘서트 티케팅 혹은 블랙 프라이데이 할인 행사 같은 이벤트는 오픈하자마자 순식간에 많은 트래픽이 몰려듭니다.
이때 제공되는 수량은 한정되어 있으므로 소수의 물량을 두고 다수가 경쟁하는 race condition(경쟁 상태)이 발생하게 됩니다.
하지만 만약 마지막 하나의 수량을 두고 여러 클라이언트가 동시에 요청을 하고 또 검증 과정도 거의 동시에 일어나서 해당 요청이 성공적으로 완료되였다면 처음 정해두었던 수량보다 더 초과된 물량이 소진되는 경우가 발생할 수도 있습니다.

# 1. 분산 락을 왜 사용할까?

**분산 락**(distributed lock)은 이러한 경쟁 상태를 해결하기 위해 공통된 저장소를 사용하여 정해진 작업의 원자성을 보장합니다.
만일 서버를 한 대만 운영한다면 내부 스레드를 제어한다던지의 방식으로 동시성 이슈를 해결할 수 있겠지만,
여러 서버를 운영하는 경우 다른 서버에서 발생하는 작업을 제어하기 어려울 수 있습니다.
그래서 동일한 자원을 서로 다른 서버에서 접근하는 경우 한 쪽이 작업한 내용이 씹히는 경우도 종종 발생합니다.
이런 일이 자주 생기진 않겠지만 단 한 번 발생으로도 위에서 언급한 물량 초과 예시처럼 비즈니스 로직상 치명적인 결과가 발생할 수도 있습니다.

이런 일을 방지하기 위해 redis와 같이 모든 서버에서 공통으로 접근 가능한 저장소를 이용하여 한 클라이언트가 락을 획득한 동안에는 나머지 클라이언트들은 대기하도록 하면 한 번에 하나의 작업만 수행되도록 보장할 수 있습니다.

<img src="/img/posts/distributed-lock-diagram.png" style="max-width:600px"/>

# 2. Spin Lock

분산 락을 구현한 방식으로 **스핀 락**(Spin lock)이 있습니다.
스핀 락은 루프를 돌면서 락을 획득할 때까지 계속 접근을 시도하는 방식입니다.
스핀 락을 사용하면 반드시 하나의 클라이언트만 락을 획득하게 되고 작업 후에 다시 락을 반환하게 됩니다.
또한 락을 얻지 못한 클라이언트는 락이 해제될 때까지 대기하다가 다시 락을 획득할때만 작업을 이어나가는 방식으로 동시성 문제를 해결할 수 있습니다.

<img src="/img/posts/distributed-lock-spinlock-flow.png" style="max-width:280px"/>

다만 단점이 있다면 트래픽이 몰리는 경우에는 redis에 부하가 간다는 점 입니다.
단시간에 락을 얻기 위해 대기하는 클라이언트가 늘어난다면 각 클라이언트가 락을 얻기 위해 계속 redis를 찌르면서 서버에 많은 부하를 줄 수 있습니다.

# 3. Redisson Client

**Redisson** 라이브러리를 사용하면 Spin lock의 단점을 보완할 수 있습니다.
Redisson client는 스핀 락처럼 계속 redis를 조회하면서 락의 획득 여부를 확인하지 않습니다.
대신 Pub/Sub 기능으로 레디스에서 락을 해제하게 되면 대기중인 클라이언트에게 알림을 주어 다시 락을 획득하도록 신호를 줍니다.
신호를 받은 받은 클라이언트는 대기 상태에서 벗어나 다시 락 획득을 시도합니다.
Redisson client는 이러한 작업을 타임아웃이 될 때까지 반복합니다.

<img src="/img/posts/distributed-lock-redislock-flow.png" style="max-width:280px"/>

해당 라이브러리는 자바 기반으로 작성되었기 때문데 Spring 프레임워크에서 많이 사용됩니다.
아래 Kotlin으로 예시를 작성해 보았습니다.

```kotlin
private fun doSomething() {
    val lock = redissonClient.getLock("key")
    try {
        val isLocked = lock.tryLock(5, 10, TimeUnit.SECONDS)
        if (!isLocked) {
            throw Exception("Failed to get lock")
        }
    } catch (exception: InterruptedException) {
        throw Exception(exception.message)
    }
    try {
        // 작업 수행
    } finally {
        lock.unlock()
    }
```

먼저 특정 스트링을 이용하여 락 객체를 가져옵니다.
그리고 `tryLock()` 메소드를 이용하여 락을 가져올 수 있으며, 획득한 경우 `true`를 반환합니다.
만일 타임아웃이 지나도록 락을 획득하지 못한다면 `false`를 반환하는데 해당 경우에는 더 이상 작업을 이어나가지 않기 위해 에러를 발생시켰습니다.
또한 락을 얻어 작업을 이어나가던 중 예상치 못하게 프로세스가 죽어버리더라도 해당 클라이언트가 반드시 락을 반환하도록 `finally` 구문에 `lock.unlock()` 메소드를 추가하였습니다.

```java
boolean tryLock(long waitTime, long leaseTime, TimeUnit unit) throws InterruptedException;
```

`tryLock()` 메소드를 자세히 보면, 첫번째 파라미터로 `waitTime`를 입력받습니다.
해당 파라미터는 락을 획득할 때까지의 대기 시간인데, 해당 시간이 다 소요될 때까지 락을 획득하지 못한다면 더 이상 락을 얻기 위해 대기하지 않고 `false`를 반환하며 종료됩니다.
두번째 인자 `leaseTime`는 락 소멸 시간입니다.
락을 얻고 난 후 해당 시간이 지나면 자동으로 락이 해제되어 다른 클라이언트가 접근 가능해집니다.
만일 락을 얻은 클라이언트가 직접 락을 해제할 때까지 잠궈두려면 해당 값을 -1로 설정해야합니다.

---

References

- [레디스와 분산 락(1/2) - 레디스를 활용한 분산 락과 안전하고 빠른 락의 구현](https://hyperconnect.github.io/2019/11/15/redis-distributed-lock-1.html)
- [Redisson을 사용하여 분산 락 구현하는 방법](https://www.hides.kr/1090)
