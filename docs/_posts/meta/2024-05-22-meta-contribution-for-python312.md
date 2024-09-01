---
layout: post
title: "[번역] Python 3.12에 대한 Meta의 공헌"
excerpt: 이번 파이썬 3.12 릴리즈에는 우리 내부의 사용 사례를 파이썬 커뮤니티에서 더 쉽게 접근할 수 있도록 개발 및 확장하였던 메타의 노력이 담겨있습니다. 이처럼 메타를 구성하는 오픈소스는 우리의 작업 방식과 학습한 결과를 커뮤니티에 공유하는 아주 중요한 역할을 합니다.
category: meta engineering
tags:
  - python
  - immortal object
  - asyncio
toc: true
thumbnail: "/img/thumbnails/meta-contribution-for-python312.png"
---

> 해당 포스트는 Meta Engineering 블로그의 [Meta contributes new features to Python 3.12](https://engineering.fb.com/2023/10/05/developer-tools/python-312-meta-new-features/) 포스트를 번역한 글입니다.
> 
> 게시일: 2023.10.05

# 메타가 Python 3.12에 도입한 기능

이번 [파이썬 3.12](https://discuss.python.org/t/python-3-12-0-final-is-here/35186) 릴리즈에는 우리 내부의 사용 사례를 파이썬 커뮤니티에서 더 쉽게 접근할 수 있도록 개발 및 확장하였던 메타의 노력이 담겨있습니다.
이처럼 메타를 구성하는 오픈소스는 우리의 작업 방식과 학습한 결과를 커뮤니티에 공유하는 아주 중요한 역할을 합니다.

몇 년 동안 우리는 자체적인 Python 런타임 [Cinder](https://github.com/facebookincubator/cinder)를 공개하고 있습니다.
또한 파이썬 커뮤니티와 꾸준히 밀접하게 협력하고 있는데, 새로운 기능과 최적화를 도입하여 파이썬 성능을 향상시키고 제삼자 입장에서 좀 더 수월하게 파이썬 런타임 최적화를 진행하도록 지원하고 있습니다.

이번 파이썬 3.12 릴리즈에서 우리는 아래와 같은 여러 부문에서 기능을 제안하고 구현하였습니다.

1. 불멸 객체
2. Type 시스템 고도화
3. 성능 최적화
4. 새로운 벤치마크 추가
5. Cinder Hooks

# 1. 불멸 객체

[Immortal Objects – PEP 683](https://peps.python.org/pep-0683/)에서는 레퍼런스 카운팅에 개입하지 않고 파이썬 인터프리터가 종료될 때까지 사라지지 않는 일명 **불멸 객체**(Immortal Objects)의 개념을 수용하였습니다.
처음 이러한 방식을 도입한 계기는 인스타그램 웹 서버의 메모리 워크로드를 최적화 하기 위해서였는데, 해당 방식으로 레퍼런스 카운팅으로 인한 copy-on-write를 줄이면서 성능을 이끌어 냈었습니다.

불멸 객체의 도입은 여러 파이썬 인터프리터 사이에 공유되는 파이썬 불변 객체(Immutable Object)에 대한 locking 절차(예를 들면 GIL)가 더 이상 필요 없다는 의미에서도 중요합니다.
이를 활용하여 [여러 서브 인터프리터](https://peps.python.org/pep-0684/) 혹은 [GIL 없는 멀티스레딩](https://peps.python.org/pep-0703/)과 같은 방식으로 파이썬의 싱글 프로세스 병렬 처리 성능을 개선할 수 있습니다.

# 2. Type 시스템 고도화

파이썬 타입 체킹 오픈소스 [Pyre](https://pyre-check.org/)의 엔지니어링 팀에서는 `@type.override` 데코레이터를 추가하였는데, 클래스 상속 계층을 리팩토링하는 과정에서 매소드 오버라이딩 관련 버그를 방지하는 데 도움을 주는 기능을 합니다.

사용자들은 이러한 데코레이터를 하위 클래스의 상속받는 메소드에 적용할 수 있습니다.
그리고 상위 클래스의 메소드를 건드리면서 상속받은 메소드가 더 이상 존재하지 않는 경우 경고 신호를 주는데, 이렇게 클래스 간의 메소드 상속 관계가 깨지는 걸 방지할 수 있습니다.
이런 방식으로 리팩토링의 신뢰성을 더해주고 좀 더 수월하게 코드를 유지보수 할 수 있습니다.

# 3. 성능 최적화

## 더 빨라진 Comprehensions

이전 파이썬 버전에서 **comprehension**은 내부의 매 실행마다 파이썬 함수 객체를 할당하고 지우는 작업을 반복하면서 마치 nested 함수처럼 컴파일되고 있었습니다.

파이썬 3.12에서 [PEP 709](https://peps.python.org/pep-0709/)를 도입하면서 list, dict, set comprehension에 대해 기존보다 최대 두 배까지 성능을 높일 수 있었습니다.

추가적으로 해당 기능을 개발하면서 파이썬 3.11에서 잘못된 동작을 유발할 수 있는 기존 바이트코드 컴파일러 버그도 발견하여 [수정](https://github.com/python/cpython/pull/104620)하였습니다.

## 즉각적인 asyncio 태스크

파이썬의 비동기 작업이 단일 프로세스에서 동시성을 제공하고 있지만, 이 과정에서 많은 런타임 오버헤드가 발생하고 있었습니다.
비동기 함수를 호출할 때마다 별개의 코루틴 객체가 생성되고, 표준 asyncio 라이브러리가 추가적으로 [태스크(Task)](https://docs.python.org/3.12/library/asyncio-task.html#asyncio.Task) 객체와 이벤트 루프(Event Loop) 스케줄링 작업을 하면서 많은 부하를 유발할 수 있습니다.

하지만 우리 내부의 모든 비동기 코드베이스를 조사해 보았더니 몇몇 상황에서는 굳이 지연할 필요 없이 바로 결과를 반환할 수 있다는 사실을 발견했습니다.
이런 상황에서 함수의 결과값을 곧바로 반환하게 된다면 코루틴 혹은 태스크 객체와 이벤트 루프 스케줄링 작업이 불필요한 오버헤드가 될 수 있습니다.

Cinder에서는 즉각적으로 비동기 실행 방식으로 이러한 오버헤드를 제거하였습니다.
만약 비동기 함수 호출이 곧바로 결과값을 가져오게 된다면 별도 코루틴 객체를 생성하지 않고 그 결과를 반환합니다.
[`asyncio.gather()`](https://docs.python.org/3.12/library/asyncio-task.html#asyncio.gather) 함수를 사용하는 경우에도 매 비동기 함수들이 즉시 결과를 반환할 수 있다면 태스크 생성이나 이벤트 루프 스케줄링 과정이 생략됩니다.

이러한 즉각적인 비동기 실행 방식은 워낙 파격적인 코드 변경이 많아서 불행히도 파이썬 3.11부터 도입된 [TaskGroup](https://docs.python.org/3.12/library/asyncio-task.html#asyncio.TaskGroup) API 환경에서는 제대로 작동하지 않았습니다.
대신 파이썬 3.12에서는 [**eager asyncio tasks**](https://docs.python.org/3.12/library/asyncio-task.html#asyncio.eager_task_factory)라는 좀 더 간단한 버전으로 추가하였습니다.
Eager task에서는 여전히 결과값을 즉시 반환할 수 있는 경우에도 코루틴과 테스크를 생성하게 되어있지만, 경우에 따라 이벤트 루프에 스케줄링하는 과정을 건너뛰도록 하였습니다.

이러한 방식은 매우 효율적이지만 정확한 명칭으로는 "커스텀 task factory를 통한 선택적 태스크 실행"에 더 가깝습니다.

## 기타 비동기 개선

다른 비동기 관련 작업으로 더 향상된 속도의 [asyncio.current_task의 C 구현체](https://github.com/python/cpython/pull/100345)와 [비동기 태스크 생성 최적화](https://github.com/python/cpython/pull/103767) 그리고 [비동기 벤치마크에서 최대 5%의 성능 향상](https://github.com/python/cpython/pull/103767#issuecomment-1528900046)도 있습니다.

## 향상된 `super()` 호출 속도

새롭게 추가한 [LOAD_SUPER_ATTR opcode](https://docs.python.org/3.12/library/dis.html#opcode-LOAD_SUPER_ATTR)로 `super().attr`와 `super().method(…)` 형태의 코드 성능을 최적화하였습니다.
이전에는 코드를 실행할 때마다 일회용 "super" 객체의 할당과 제거 과정이 반드시 필요했습니다.
이제는 일반적인 메서드나 인자 호출보다도 오버헤드가 거의 발생하지 않습니다.

## 기타 성능 최적화

그 외에도 추가적으로 두 가지 작업 [hasattr](https://github.com/python/cpython/pull/104063)[ 최적화](https://github.com/python/cpython/pull/104079)와 [unittest.mock.Mock 성능 3.8배 향상](https://github.com/python/cpython/pull/100252)도 있습니다.

# 4. 새로운 벤치마크 추가

메타에서 내부적으로 파이썬을 최적화하는 경우에는 보통 실제 운영 환경에 대비하여 최적화를 직접 테스트하고 유효성을 검증할 수 있습니다.
반면 오픈소스 파이썬 최적화 작업은 운영 환경을 위한 테스트 환경이 별도로 존재하지 않으며, 다양한 환경에서도 동일하게 효율적인 성능을 내야만 합니다.

[파이썬 성능 벤치마크](https://github.com/python/pyperformance)는 파이썬 성능 최적화에 사용되는 표준 벤치마크입니다.
파이썬 3.12를 개발하면서 몇몇 새로운 벤치마크를 추가했는데, 메타에서 발견한 워크로드 특성이 정확하게 표현되어 있습니다.

우리가 추가한 기능은 아래와 같습니다.

- 과도한 asyncio 부하에 최적화된 [<u>async_tree 벤치마크 모델</u>](https://github.com/python/pyperformance/pull/187)
- 기존에 사각지대였던 [<u>comprehension</u>](https://github.com/python/pyperformance/pull/265)과 [<u>super()</u>](https://github.com/python/pyperformance/pull/271)를 더 철저하게 검증하는 두 개의 벤치마크

# 5. Cinder Hooks

Cinder의 몇몇 부분(JIT 컴파일러와 Static 파이썬)은 플랫폼 호환 이슈, C와 C++의 차이, 의미 변경, 코드 사이즈와 같은 이유로 CPython에 접목시키기 까다로웠는데, 대신 우리는 독립적인 확장 모듈 CinderX로 패키징하는 방식을 택하였습니다. 

이에 따라 코어 런타임에 여러 개의 새로운 hook이 필요해졌으며, 파이썬 3.12에 아래와 같은 hook을 추가해 두었습니다.

- [<u>파이썬 함수에 대한 벡터콜 진입점 설정 API</u>](https://github.com/python/cpython/pull/92257). 해당 API는 JIT에게 주어진 함수에 대한 실행을 이어갈 시작 지점을 제공합니다.
- [<u>딕셔너리</u>](https://github.com/python/cpython/pull/31787), [<u>타입</u>](https://github.com/python/cpython/pull/97875), [<u>함수</u>](https://github.com/python/cpython/pull/98175), [<u>코드 객체</u>](https://github.com/python/cpython/pull/99859)를 감시하는 기능이 추가되었습니다. 이러한 기능들은 Cinder JIT의 예측을 넘어서는 동적 변화를 감지하고 가능한 빠른 경로를 유지하도록 합니다.
- [<u>CPython 코어 인터프리터의 코드 제너레이터 확장성</u>](https://github.com/python/cpython/pull/102022)이 추가되어 static 파이썬이 추가된 정적 파이썬 opcode로 인터프리터를 쉽게 재생성할 수 있게 하였습니다. 또한 [<u>모든 GC 추적 객체를 찾아가는 C API</u>](https://github.com/python/cpython/pull/102014)를 활용하여 Cinder JIT가 활성화되기 전에 생성된 함수를 발견할 수 있게 되었습니다.ㄴ
- [<u>Perf-map 파일에 thread-safe하게 접근하는 API</u>]() 또한 추가하였습니다. Perf-map 파일은 리눅스 perf 프로파일러이 기계어에서 동적으로 생성된 섹션에 사람이 읽을 수 있는 이름을 설정할 수 있도록 합니다. 이러한 API를 통해 Cinder JIT가 별개의 JIT 혹은 파이썬 3.12의 [<u>perf trampoline</u>](https://github.com/python/cpython/pull/96123)과 충돌 없이 안전하게 perf map 파일에 기록할 수 있도록 하였습니다.

이러한 기능들은 CPython 써드파티 JIT 컴파일러나 런타임 옵티마이저를 제작하려는 모두에게 유용할 것이라고 기대합니다.
또한 추후 코어 CPython 내부 감시 기능을 활용할 계획도 있습니다.

# 파이썬 3.12 그 이후

파이썬은 메타에서 상당한 비중을 차지하고 있습니다.
[인스타그램의 서버 스택](/docs/python-immortal-objects)을 포함하여 메타 내부 인프라의 주요한 구성 요소 중 하나입니다.
또한 파이썬은 [AI/ML 작업](https://ai.meta.com/blog/code-llama-large-language-model-coding/)에서 가장 보편적으로 사용되는 언어로, 컴퓨터 비전이나 자연어 처리 등과 같이 광범위한 사용 사례를 위한 머신러닝 프레임워크 [PyTorch](https://pytorch.org/)의 발전과 함께 주목받고 있습니다.

우리가 파이썬 커뮤니티에 기여하는 부분은 단지 3.12 릴리즈에만 그치지 않습니다.
현재는 [PEP-703](https://peps.python.org/pep-0703/) 제안에 따라 파이썬에서 GIL을 걷어내고 여러 스레드에서 병렬로 실행시킬 방법을 고민하고 있습니다.
이러한 업데이트는 멀티스레딩 환경에서 파이썬을 사용하는 모두가 반길겁니다.

메타와 파이썬 커뮤니티 간의 관계도 여전히 계속됩니다.
2023년에도 꾸준히 [파이썬 Developer-in-Residence 프로그램](https://pyfound.blogspot.com/2022/03/meta-deepens-its-investment-in-python.html)이나 [파이콘 US](https://us.pycon.org/2023/#)와 같은 단체를 서포트하고 있습니다.
또한 파이콘에서 발표한 [PyTorch의 파이썬 컴파일러를 활용한 AI/ML 성능 향상](https://us.pycon.org/2023/schedule/presentation/155/)과 [메타 엔지니어링 블로그 게시글](https://engineering.fb.com/?s=python)을 통해 우리가 쌓은 지식을 공유하고 있습니다.

우리는 이러한 오픈소스 커뮤니티의 일원이 되어 항상 감사하고 있으며 함께 힘을 모아 파이썬 언어를 더 발전시키기를 기대합니다.

---

# Meta contributes new features to Python 3.12

This week’s release of [Python 3.12](https://discuss.python.org/t/python-3-12-0-final-is-here/35186) marks a milestone in our efforts to make our work developing and scaling Python for Meta’s use cases [more accessible to the broader Python community](https://discuss.python.org/t/making-cinder-more-broadly-available/14062).
Open source at Meta is an important part of how we work and share our learnings with the community.

For several years, we have been sharing our work on Python and CPython through our open source Python runtime, [Cinder](https://github.com/facebookincubator/cinder).
We have also been working closely with the Python community to introduce new features and optimizations to improve Python’s performance and to allow third parties to experiment with Python runtime optimization more easily.

For the Python 3.12 release, we proposed and implemented features in several areas:

- Immortal Objects
- Type system improvements
- Performance optimizations
- New benchmarks
- Cinder hooks

# Immortal Objects

[Immortal Objects – PEP 683](https://peps.python.org/pep-0683/) makes it possible to create Python objects that don’t participate in [reference counting](https://devguide.python.org/internals/garbage-collector/), and will live until Python interpreter shutdown.
The original motivation for this feature was to reduce memory use in the forking Instagram web-server workload by reducing copy-on-writes triggered by reference-count updates.

Immortal Objects are also an important step towards truly immutable Python objects that can be shared between Python interpreters with no need for locking, for example, via the global interpreter lock (GIL)
This can enable improved Python single-process parallelism, whether via [multiple sub-interpreters](https://peps.python.org/pep-0684/) or [GIL-free multi-threading](https://peps.python.org/pep-0703/).

# Type system improvements

The engineering team behind [Pyre](https://pyre-check.org/), an open source Python type-checker, authored and implemented [PEP 698](https://peps.python.org/pep-0698/) to add a `@typing.override` decorator, which helps avoid bugs when refactoring class inheritance hierarchies that use method overriding.

Python developers can apply this new decorator to a subclass method that overrides a method from a base class.
As a result, static type checkers will be able to warn developers if the base class is modified such that the overridden method no longer exists.
Developers can avoid accidentally turning a method override into dead code.
This improves confidence in refactoring and helps keep the code more maintainable.

# Performance optimizations

## Faster comprehensions

In previous Python versions, all comprehensions were compiled as nested functions, and every execution of a comprehension allocated and destroyed a single-use Python function object.

In Python 3.12, [PEP 709](https://peps.python.org/pep-0709/) inlines all list, dict, and set comprehensions for better performance (up to two times better in the best case).

The implementation and debugging of PEP 709 also uncovered a pre-existing bytecode compiler bug that could result in silently wrong code execution in Python 3.11, which we [fixed](https://github.com/python/cpython/pull/104620).

## Eager asyncio tasks

While Python’s asynchronous programming support enables single-process concurrency, it also has noticeable runtime overhead.
Every call to an async function creates an extra coroutine object, and the standard asyncio library will often bring additional overhead in the form of [Task](https://docs.python.org/3.12/library/asyncio-task.html#asyncio.Task) objects and event loop scheduling.

We observed that, in practice, in a fully async codebase, many async functions are often able to return a result immediately, with no need to suspend.
In these cases, if the result of the function is immediately awaited, the coroutine/Task objects and event loop scheduling can be unnecessary overhead.

Cinder eliminates this overhead via eager async execution.
If an async function call is awaited immediately, it may return a result directly, without creating a coroutine object.
If an [`asyncio.gather()`](https://docs.python.org/3.12/library/asyncio-task.html#asyncio.gather) is immediately awaited, and all the async functions it gathers are able to return immediately, there’s no need to ever create a Task  or schedule it to the event loop.

Fully eager async execution would be an invasive (and breaking) change to Python, and doesn’t work as well with the new Python 3.11+ [TaskGroup](https://docs.python.org/3.12/library/asyncio-task.html#asyncio.TaskGroup) API for managing concurrent tasks.
So in Python 3.12 we added a simpler version of the feature: [eager asyncio tasks](https://docs.python.org/3.12/library/asyncio-task.html#asyncio.eager_task_factory).
With eager tasks, coroutine and Task objects are still created when a result is available immediately, but we can sometimes avoid scheduling the task to the event loop and instead resolve it right away.

This is more efficient, but it is a semantic change, so this feature is [opt-in via a custom task factory](https://docs.python.org/3.12/library/asyncio-task.html#asyncio.eager_task_factory).

## Other asyncio improvements

We also landed a faster [C implementation of asyncio.current_task](https://github.com/python/cpython/pull/100345) and an [optimization to async task creation](https://github.com/python/cpython/pull/103767) that shows a [win of up to 5 percent on asyncio benchmarks](https://github.com/python/cpython/pull/103767#issuecomment-1528900046).

## Faster `super()` calls

The new [LOAD_SUPER_ATTR opcode](https://docs.python.org/3.12/library/dis.html#opcode-LOAD_SUPER_ATTR) optimizes code of the form `super().attr` and `super().method(…)`.
Such code previously had to allocate, and then throw away, a single-use “super” object each time it ran.
Now it has little more overhead than an ordinary method call or attribute access.

## Other performance optimizations
We also landed two [hasattr](https://github.com/python/cpython/pull/104063) [optimizations](https://github.com/python/cpython/pull/104079) and a [3.8x performance improvement to unittest.mock.Mock](https://github.com/python/cpython/pull/100252).

# New benchmarks

When we optimize Python for internal use at Meta, we are usually able to test and validate our optimizations directly against our real-world workloads.
Optimization work on open-source Python doesn’t have such a production workload to test against and needs to be effective (and avoid regression) on a variety of different workloads.

The [Python Performance Benchmark suite](https://github.com/python/pyperformance) is the standard set of benchmarks used in open-source Python optimization work.
During the 3.12 development cycle, we contributed several new benchmarks to it so that it more accurately represents workload characteristics we see at Meta.

We added:

- A [<u>set of async_tree benchmarks</u>](https://github.com/python/pyperformance/pull/187) that better model an asyncio-heavy workload.
- A pair of benchmarks that exercise [<u>comprehensions</u>](https://github.com/python/pyperformance/pull/265) and [<u>super()</u>](https://github.com/python/pyperformance/pull/271) more thoroughly, which were blind spots of the existing benchmark suite.

# Cinder hooks

Some parts of Cinder (our [JIT compiler](https://github.com/facebookincubator/cinder#the-cinder-jit) and [Static Python](https://github.com/facebookincubator/cinder#static-python)) wouldn’t make sense as part of upstream CPython (because of limited platform support, C versus C++, semantic changes, and just the size of the code), so our goal is to package these as an independent extension module, CinderX.

This requires a number of new hooks in the core runtime.
We landed many of these hooks in Python 3.12:

- An [<u>API to set the vectorcall entrypoint for a Python function</u>](https://github.com/python/cpython/pull/92257). This gives the JIT an entry point to take over execution for a given function.
- We added [<u>dictionary watchers</u>](https://github.com/python/cpython/pull/31787), [<u>type watchers</u>](https://github.com/python/cpython/pull/97875), [<u>function watchers</u>](https://github.com/python/cpython/pull/98175), and [<u>code object watchers</u>](https://github.com/python/cpython/pull/99859). All of these allow the Cinder JIT to be notified of dynamic changes that might invalidate its assumptions, so its fast path can remain as fast as possible.
- We landed [<u>extensibility in the code generator for CPython’s core interpreter</u>](https://github.com/python/cpython/pull/102022) that will allow Static Python to easily re-generate an interpreter with added Static Python opcodes, and a [<u>C API to visit all GC-tracked objects</u>](https://github.com/python/cpython/pull/102014), which will allow the Cinder JIT to discover functions that were created before it was enabled.
- We also added a [<u>thread-safe API for writing to perf-map files</u>](https://github.com/python/cpython/pull/103546). Perf-map files allow the Linux perf profiler to give a human-readable name to dynamically-generated sections of machine code, e.g. from a JIT compiler. This API will allow the Cinder JIT to safely write to perf map files without colliding with other JITs or with the new Python 3.12 [<u>perf trampoline feature</u>](https://github.com/python/cpython/pull/96123).

These improvements will be useful to anyone building a third party JIT compiler or runtime optimizer for CPython.
There are also plans to use the watchers internally in core CPython.

# Beyond Python 3.12

Python plays a significant role at Meta.
It’s an important part of our infrastructure, including the [Instagram server stack](https://engineering.fb.com/2023/10/05/developer-tools/python-312-meta-new-features/).
And it’s the lingua franca for [our AI/ML work](https://ai.meta.com/blog/code-llama-large-language-model-coding/), highlighted by our development of [PyTorch](https://pytorch.org/), a machine learning framework for a wide range of use cases including computer vision, natural language processing, and more.

Our work with the Python community doesn’t end with the 3.12 release.
We are currently discussing a new proposal, [PEP 703](https://peps.python.org/pep-0703/), with the Python Steering Council to remove the GIL and allow Python to run in multiple threads in parallel.
This update could greatly help anyone using Python in a multi-threaded environment.

Meta’s involvement with the Python community also goes beyond code.
In 2023, we continued supporting the [Developer in Residence program for Python](https://pyfound.blogspot.com/2022/03/meta-deepens-its-investment-in-python.html) and sponsored events like [PyCon US](https://us.pycon.org/2023/#).
We also shared our learnings in talks like “[Breaking Boundaries: Advancements in High-Performance AI/ML through PyTorch’s Python Compiler](https://us.pycon.org/2023/schedule/presentation/155/)” and posts on the [Meta Engineering blog](https://engineering.fb.com/?s=python).

We are grateful to be a part of this open source community and look forward to working together to move the Python programming language forward.

---

References

- [Meta contributes new features to Python 3.12 - Engineering at Meta](https://engineering.fb.com/2023/10/05/developer-tools/python-312-meta-new-features/)
