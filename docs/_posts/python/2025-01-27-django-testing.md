---
layout: post
title: "Django 테스트"
category: django
tags:
  - django
  - test
  - unittest
toc: true
thumbnail: "/img/thumbnails/django.png"
---

Django는 웹프레임워크가 갖추어야 할 대부분의 기능을 포함하고 있다는 장점을 가지고 있습니다.
테스트 기능이 내장되어 있는 점 역시 중요한데, 잘 활용하면 프로젝트의 기본적인 안정성을 보장하며 개발 생산성이 향상될 수 있습니다.

Django의 테스트 모듈은 파이썬 `unittest` 라이브러리 기반으로 되어있습니다.
덕분에 별도 `pytest`와 같은 라이브러리를 설치하지 않고도 여러 테스트 케이스를 작성 및 검증할 수 있습니다.
아래에서 `unittest`의 기본적인 작동 원리부터 Django 프로젝트 내부에 어떻게 반영되어 있는지 살펴보았습니다.

---

# 1. unittest

`unittest` 라이브러리는 Java 진영의 테스트 프레임워크 Junit의 영향을 받았으며, 보편적인 테스트 라이브러리에 존재하는 테스트 자동화, setup/shutdown 등의 기능을 지원하고 있습니다.
덕분에 파이썬에서 `unittest`를 활용하여 테스트 케이스 작성부터 실행 및 결과 검증을 체계적으로 수행할 수 있습니다. 

`unittest`의 주요 개념은 아래와 같습니다.

- **테스트 픽스쳐** (Test Fixture)
  - 테스트 수행 이전에 필요한 사전 준비 작업 (ex. 서버 실행, 데이터베이스 프록시 혹은 디렉토리 생성 등)
- **테스트 케이스** (Test Case)
  - 개별 테스트 작업.
  - 테스트 케이스 메소드명은 `test`로 시작하도록 작성해야 합니다.
- **테스트 스위트** (Test Suite)
  - 여러 개의 테스트 케이스를 모아 실행할 수 있는 그룹
- **테스트 러너** (Test Runner)
  - 전체 테스트를 실행하고 결과를 출력하는 컴포넌트


## 1.1 Test Case

`unittest`는 클래스 기반으로 테스트 케이스를 구성하며, `unittest.TestCase` 클래스를 상속받아 작성합니다.
아래 예제에서 두 가지 간단한 테스트 케이스를 작성하였습니다.

```python
import unittest

class TestExample(unittest.TestCase):
    def test_addition(self):
        self.assertEqual(1 + 2, 3)

    def test_typeerror(self):
        a = 4
        b = "5"
        with self.assertRaises(TypeError):
            a + b

if __name__ == "__main__":
    unittest.main()
```

`unittest`에서는 검증 방법으로 `assertEqual`, `assertRaises` 등과 같은 메소드를 제공합니다.
해당 메소드는 실패 시에 상세한 오류 메시지를 제공하고 결과를 취합하여 리포트를 생성하기 때문에 단순히 조건이 실패했다는 내용만 보여주는 `assert` 메소드보다 디버깅이 용이하다는 장점이 있습니다.
또한 `assertIsNone`, `assertIn` 등과 같은 직관적인 메소드를 사용하여 테스트 코드의 명확한 의도가 드러나기 때문에 가독성이나 유지보수가 쉬워집니다.

주로 사용하는 메소드는 아래와 같습니다.

| 메소드 | 설명
|---|---
|`assertEqual(a, b)` | `a == b`인지 검증
|`assertNotEqual(a, b)` |  `a != b`인지 검증
|`assertTrue(a)` | `a`값이 `True`인지 검증
|`assertFalse(a)` | `a`값이 `False`인지 검증
|`assertIsNone(a)` | `a is None`인지 검증
|`assertIn(a, b)` | `a in b`인지 검증
|`assertNotIn(a, b)` | `a not in b`인지 검증
|`assertIs(a, b)` | `a is b`인지 검증
|`assertIsNot(a, b)` | `a is not b`인지 검증
|`assertRaises(exc, func)` | `func` 메소드 실행시 `exc` 예외가 발생하는지 검증

테스트 케이스 작성 후 main 함수를 호출하거나 아래 커맨드라인으로 작성한 테스트를 검증할 수 있습니다.

```bash
$> python -m unittest ./test_example.py
..
----------------------------------------------------------------------
Ran 2 tests in 0.000s
```

## 1.2 클래스 단위 테스트

여러 테스트 케이스를 작성하면서 테스트마다 공통으로 필요한 준비 작업이나 테스트 후 마무리 작업이 반복될 수 있습니다.
이런 경우 아래 메소드를 활용할 수 있습니다.

- **`setUp()`**: 개별 테스트 케이스 호출 이전에 실행되는 메소드입니다.
- **`tearDown()`**: 테스트 케이스 호출 이후에 실행되는 메소드입니다. 테스트 실패 여부와 상관없이 `setUp()` 메소드가 실행되었다면 반드시 실행됩니다.
- **`setUpClass()`**: 클래스의 각 테스트가 실행되기 이전에 실행됩니다. 클래스 전체에서 한 번만 실행됩니다. 클래스를 인자로 받기 때문에 `@classmethod` 데코레이터로 감싸주어야 합니다.
- **`tearDownClass()`**: 클래스의 모든 테스트 함수 실행이 끝나면 실행됩니다. 마찬가지로 클래스에서 한 번만 실행되며 `@classmethod` 데코레이터로 감싸주어야 합니다.

위 내용을 고려하여 아래 테스트 케이스 예제를 작성하였습니다.

```python
import unittest

class TestOperations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = 1

    @classmethod
    def tearDownClass(cls):
        cls.data = None

    def setUp(self):
        self.number = 10

    def tearDown(self):
        self.number = 0

    def test_addition(self):
        self.number += 2
        self.assertEqual(self.number, 12)

    def test_multiplication(self):
        self.number *= 2
        self.assertEqual(self.number, 20)

if __name__ == '__main__':
    unittest.main()
```

클래스의 테스트가 실행되기 전에 `data` 값이 초기화되며 테스트가 종료되면 다시 `None`으로 덮어씌워집니다.
또한 각 테스트 함수마다 `number` 값은 10으로 초기화되었다가 함수가 끝나면 다시 0으로 변경됩니다.

이러한 점을 잘 활용하여 테스트를 위한 사전 작업을 정의할 수 있습니다.
만일 비즈니스 로직 검증을 위해 데이터베이스에 특정 데이터가 필요하거나 매 테스트마다 데이터 초기화 작업이 필요한 경우에 유용합니다.

## 1.3 Test Suite

다양한 기능에 따라 테스트 환경을 구성하면서 여러 테스트 클래스가 존재할 수 있습니다.
이러한 경우 여러 클래스를 테스트 스위트(Test Suite)로 그룹화할 수 있습니다.

```python
suite = unittest.TestSuite(
    [
        TestOperations("test_addition"),
        TestOperations("test_multiplication"),
        TestExample("test_typeerror"),
        ...
    ]
)
runner = unittest.TextTestRunner()
runner.run(suite)
```

또한 이렇게 직접 구성한 테스트 스위트를 테스트 Runner를 사용하여 한번에 실행할 수 있습니다.

---

# 2. Django Testing

Django에서는 앱 생성시에 `tests.py` 파일도 같이 생성되는데 해당 파일에 테스트 코드를 작성할 수 있습니다.
그리고 커맨드 창에 `python manage.py test` 명령어를 입력하여 테스트를 실행할 수 있습니다.

Django에서는 `django.test.TestCase`를 상속받아 테스트 코드를 작성합니다.
`unittest`와 동일하게 클래스 기반으로 되어있습니다.

```python
class AuthTest(django.test.TestCase):
    def setUp(self):
        user = User.objects.create(username="test-user")
        user.set_password("1q2w3e4r!")
        user.save()

    def test_login(self):
        data = {"username": "test-user", "password": "1q2w3e4r!"}
        response = self.client.post(
            "/auth/login",
            data=json.dumps(data),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
```

`django.test.TestCase`에서도 setUp, tearDown과 같은 방법으로 fixture를 구성할 수 있습니다.
또한 내부에 client로 API를 호출도 가능합니다.

## 2.1 트랜잭션 관리

`django.test.TestCase`에서는 클래스마다 데이터베이스 트랜잭션을 생성합니다.
그리고 클래스가 종료될 때 트랜잭션이 커밋되지 않고 롤백되는데, 테스트 과정에서 생성된 데이터는 저장되지 않습니다.
각 테스트 메소드는 실행 전에 트랜잭션의 savepoint가 설정되는데 테스트 메소드 종료 후 다시 savepoint로 롤백됩니다.
위 테스트 예제에서 setUp 단계에서 생성한 User 데이터도 테스트 함수 실행이 끝나면 자동으로 롤백됩니다.

이러한 방식으로 트랜잭션을 관리하여 대규모 테스트를 실행할 때 실행 시간이 단축할 수 있습니다.
또한 한 클래스에 여러 테스트 함수가 구성되더라도 각 테스트간에 데이터가 격리되어 서로 영향을 주지 않습니다.

다만 피치 못 하게 `TestCase`를 사용할 수 없는 경우도 있습니다.
예시로 데이터베이스가 Primary/Replica 구성인 경우를 가정해 보겠습니다.

### 2.1.1 Primary/Replica 구성인 경우

이러한 경우 해당 Django 프로젝트는 primary와 replica 데이터베이스 각각에 대한 연결 정보를 가지고 있습니다.
또한 두 데이터베이스 간의 데이터 동기화 latency도 워낙 짧아서 서비스상으로는 큰 문제가 발생하지 않습니다.

문제는 테스트 실행시 발생합니다.
Django는 primary와 replica 각각 데이터베이스를 생성하지만 서로 간 데이터 동기화가 발생하지 않습니다.
이러한 상황에서 primary에 데이터를 입력해도 replica에서는 데이터가 조회되지 않아서 의도한 대로 작동하지 않을 수 있습니다.

이를 위하여 아래와 같이 `TEST.MIRROR` 설정으로 테스트 실행 시에 특정 데이터베이스를 미러랑 하도록 명시할 수 있습니다.
이렇게 설정하면 테스트 데이터베이스 마이그레이션 진행시에 replica는 생성되지 않으며 대신 replica에 대한 커넥션은 default를 바라보게 되어 실제 데이터 동기화가 이루어지는 것처럼 작동하게 됩니다.

```python
# settings.py
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "primary_db",
        ...
    },
    "replica": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "replica_db",
        ...
        "TEST": {
            "MIRROR": "default",
        },
    }
}
```

또한 `TestCase`대신 `TransactionTestCase`를 사용해야 합니다.
`TransactionTestCase`는 매 테스트 케이스마다 실제로 데이터베이스에 커밋 작업이 이루어집니다.
따라서 트랜잭션 커밋/롤백 동작을 엄밀하게 검증하거나 복잡한 트랜잭션 이벤트를 검증하는 경우에는 `TransactionTestCase`를 사용해야 합니다.

```python
class Test(django.test.TransactionTestCase):
    databases = {"default", "replica"}

    def test_read_from_replica(self):
        # primary에 데이터 생성
        MyModel.objects.using("default").create(name="Test Item")
        # replica에서 조회
        data = MyModel.objects.using("replica").all()

        self.assertEqual(data.count(), 1)
```

## 2.2 테스트 Runner

Djangodml 전반적인 테스트 lifecyle은 `django.test.runner.DiscoverRunner` 클래스가 담당합니다.
아래와 같은 순서로 진행됩니다.

1. 프로젝트 디렉토리를 스캔하여 테스트 suite를 생성한 후에
2. 테스트 데이터베이스를 생성하고
3. 데이터베이스를 비롯한 시스템 체크를 진행하여 이상이 없는지 확인합니다.
4. 첫 단계에서 생성한 테스트 suite를 실행하여 작성한 테스트 케이스를 검증합니다.
5. 테스트가 끝나면 데이터베이스를 다시 제거하고
6. 결과가 담긴 리포트를 출력합니다.

### 2.2.1 테스트 Suite 생성

프로젝트의 테스트 코드가 작성된 파일을 찾아서 모든 테스트 케이스를 가져옵니다.
기본적으로 test*.py 형식의 파일이 대상이 됩니다.

모든 테스트 케이스를 가져왔다면 아래 순서로 정렬합니다.

1. `django.test.TestCase`
2. `django.test.SimpleTestCase` 및 하위 클래스(ex. `django.test.TransactionTestCase`)
3. `unittest.TestCase`

`django.test.TestCase`는 기본적으로 트랜잭션 롤백 방식으로 데이터를 관리하기 때문에 항상 깨끗한 상태에서 테스트를 시작할 수 있습니다.
따라서 이 특성을 활용하여 모든 테스트가 안정적인 상태에서 실행되도록 보장합니다.
`TransactionTestCase`는 실제 트랜잭션을 커밋하거나 롤백하므로 테스트 간의 순서가 결과에 영향을 미칠 수 있습니다.
해당 테스트가 먼저 실행되면 데이터베이스 상태를 오염시킬 가능성이 있으므로, `TestCase` 이후에 배치되었습니다.

참고로 테스트 클래스의 상속 관계는 아래와 같습니다.

```shell
unittest.TestCase
└── django.test.SimpleTestCase
    └── django.test.TransactionTestCase
        ├── django.test.TestCase
        └── django.test.LiveServerTestCase
```

### 2.2.2 테스트 데이터베이스 생성

마이그레이션 파일에 정의된 스키마를 가져와 테스트 용도로 연결할 임시 데이터베이스와 테이블을 생성합니다.
만일 동일한 이름을 가진 데이터베이스가 이미 존재한다면 제거하고 다시 생성할 수 있습니다.

기본적으로 테스트 데이터베이스는 `test_` prefix가 붙어서 생성됩니다.
만일 다른 이름으로 생성하고 싶다면 settings DATABASES 설정에서 `TEST.NAME` 값으로 명시할 수 있습니다.

### 2.2.3 테스트 Suite 실행

테스트 코드를 실행하여 올바르게 작동하는지 검증합니다.

### 2.2.4 테스트 데이터베이스 제거

테스트 용도로 생성했던 데이터베이스를 다시 제거합니다.
해당 절차는 테스트 통과 여부와 상관없이 진행됩니다.

`--keepdb` 옵션을 주면 생성했던 데이터베이스가 제거되는 것을 방지할 수 있습니다.
다만 데이터베이스와 테이블 스키마가 모두 남아있어서 이후 진행되는 테스트에 영향을 주지 않도록 주의해야 합니다.

---

References

- [unittest — Unit testing framework — Python 3.13.1 documentation](https://docs.python.org/3/library/unittest.html){:target="_blank"}
- [Testing tools \| Django documentation \| Django](https://docs.djangoproject.com/en/5.1/topics/testing/overview/){:target="_blank"}
