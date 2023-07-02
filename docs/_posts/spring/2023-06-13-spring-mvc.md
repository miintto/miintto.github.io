---
layout: post
title: Spring MVC 구조
category: spring
tags: 
  - spring
  - mvc
  - controller
  - entity
banner: "/img/posts/spring-mvc-banner.png"
---

일반적으로 **MVC** 라고 하면 어플리케이션의 구성 요소를 역할에 따라 **모델**, **뷰**, **컨트롤러**로 구분하는 소프트웨어 디자인 패턴을 의미합니다.
스프링에서도 MVC 패턴에 기반을 둔 모듈을 제공하여 쉽게 웹 어플리케이션을 작성할 수 있도록 지원하고 있습니다.
아래에서 예시로 간단한 API를 만들어 보면서 스프링 MVC의 기본적인 구조를 살펴봅시다.

---

# 1. Spring MVC Lifecycle

개발자가 주로 작성하는 부분은 컨트롤러 이후 로직이지만, 클라이언트로부터 들어온 요청은 스프링 내부 여러 구성 요소들을 거쳐 컨트롤러에 도달하게 됩니다.
도식도를 그려보면 대략 아래와 같습니다.

<img src="/img/posts/spring-mvc-lifecycle.png" style="max-width:720px"/>

1. 어플리케이션으로 들어온 요청은 여러 Filter들을 거쳐서 `DispatcherServlet`에 도달합니다.
2. 등록된 `HandlerMapping`을 모두 조회하여 요청에 알맞은 핸들러(Controller)를 가져옵니다.
3. 해당 핸들러를 실행할 수 있는 `HandlerAdapter` 를 가져옵니다.
4. `HandlerAdapter`의 `handle()` 메소드를 호출하여 핸들러를 실행후 `ModelAndView` 객체를 반환합니다.
5. `ModelAndView` 객체가 null이 아닌 경우 `ViewResolver`로부터 매칭되는 `View`를 가져와 렌더링합니다.
6. 실행 중 예외가 발생한 경우 `HandlerExceptionResolver`에서 처리합니다.
7. 처리된 응답은 다시 Filter를 거쳐서 클라이언트로 반환됩니다.

아래는 `DispatcherServlet` 클래스의 일부분을 가져왔습니다.
`doDispatch()` 메소드에서 주요 과정이 이루어집니다.

```java
// org.springframework.web.servlet.DispatcherServlet.java

protected void doDispatch(HttpServletRequest request, HttpServletResponse response) throws Exception {
    ...
    try {
        processedRequest = checkMultipart(request);
        multipartRequestParsed = (processedRequest != request);

        // HandlerMapping에서 요청에 알맞은 핸들러 조회
        mappedHandler = getHandler(processedRequest);
        if (mappedHandler == null) {
            noHandlerFound(processedRequest, response);
            return;
        }

        // 핸들러 실행 가능한 어댑터 조회
        HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());

        String method = request.getMethod();
        boolean isGet = HttpMethod.GET.matches(method);
        if (isGet || HttpMethod.HEAD.matches(method)) {
            long lastModified = ha.getLastModified(request, mappedHandler.getHandler());
            if (new ServletWebRequest(request, response).checkNotModified(lastModified) && isGet) {
                return;
            }
        }

        // 등록된 HandlerIntercepter들의 preHandle 메소드 실행
        if (!mappedHandler.applyPreHandle(processedRequest, response)) {
            return;
        }

        // 해당 부분에서 Controller 실행
        mv = ha.handle(processedRequest, response, mappedHandler.getHandler());

        if (asyncManager.isConcurrentHandlingStarted()) {
            return;
        }

        applyDefaultViewName(processedRequest, mv);
        // 등록된 HandlerIntercepter들의 postHandle 메소드 실행
        mappedHandler.applyPostHandle(processedRequest, response, mv);
    }
    catch (Exception ex) {
        dispatchException = ex;
    }
    catch (Throwable err) {
        dispatchException = new NestedServletException("Handler dispatch failed", err);
    }
    // 실행 중 exception이 발생한 경우 에러 처리
    // 매칭되는 View 렌더링
    // HandlerIntercepter들의 afterCompletion 메소드 실행
    processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);
```

---

# 2 Controller

이제 간단한 API를 작성해 봅시다.
기본적으로 루트 `GET /` 경로 호출시 'ok' 응답을 반환하도록 설계하려고 합니다.

## 2.1 의존성 추가

스프링 MVC를 사용하기 위해 `build.gradle.kts` 파일에 **spring-boot-starter-web** 의존성을 추가합니다.
해당 의존성에는 톰캣(Tomcat)과 같이 MVC 기반의 RESTful 어플리케이션을 만들기 위한 구성 요소들이 포함되어 있습니다.

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")  // 추가
    ...
}
```

위와 같이 필요할 때마다 일일이 의존성을 추가해도 되지만,
[Spring Initializer](https://start.spring.io) 사이트에서 초기 프로젝트를 만들 때 기본적으로 많이 사용하는 의존성들을 선택한 채로 생성할 수도 있습니다.

해당 의존성 추가 후 어플리케이션 실행시 톰캣 서버가 구동되어서 임의로 중지할 때까지 종료되지 않고 계속 실행됩니다.
기본적으로 8080 포트가 활성화됩니다.

## 2.2 Controller 작성

새로운 패키지를 만들고 컨트롤러 클래스를 생성합니다.

```shell
└── com.miintto.matstagram
    ├── api
    │   └── home
    │       └── HomeController  # 생성
    └── MatstagramApplication.kt
```

```kotlin
@RestController
class HomeController {
    @GetMapping("/")
    fun index() = ResponseEntity<String>("ok", HttpStatus.OK)
}
```

`@RestController` 어노테이션을 입력하면 해당 클래스는 컨트롤러로 지정됩니다.
또한 `@GetMapping` 어노테이션을 등록하면 해당하는 uri 및 메소드는 `HandlerMapping` 클래스 내부 registry에 등록됩니다.
등록된 uri는 클라이언트로부터 요청이 왔을때 요청 uri와 비교하여 일치하는 핸들러를 찾을 때 사용됩니다.


## 2.3 Controller VS RestController

두 어노테이션 `@Controller`, `@RestController`은 특정 클래스를 컨트롤러로 명시할 때 사용하지만 미묘한 차이가 있습니다.

**Controller**는 기본적으로 View를 렌더링 하기 위해 사용합니다.
위에서 설명했듯이 `HandlerAdapter`의 실행 결과로 `ModelAndView` 객체가 반환된다고 했는데, 그 내부에 ViewName을 가지고 있습니다.
해당 값은 컨트롤러 메소드에서 반환값이 스트링(string)인 경우 그 스트링이 ViewName 으로 지정됩니다.
그 후 `ViewResolver`가 ViewName과 일치하는 `View`를 가져와 렌더링 합니다.

이때 만일 `View`를 사용하지 않고 해당 스트링을 그대로 반환하고 싶다면 `@ResponseBody` 어노테이션을 사용해야합니다.
해당 어노테이션을 메소드에 기입하면 추가적인 렌더링 과정 없이 그 문자열을 응답으로 내려줍니다.
꼭 String에만 국한되어있는건 아니고 객체를 응답하는 경우에도 해당 방법이 사용됩니다.

```kotlin
@Controller
class HomeController {
    @GetMapping("/")
    @ResponseBody fun index() = "ok"
```

**RestController**는 여기서 `@Controller`와 `@ResponseBody`가 합쳐진 역할을 합니다.
굳이 어노테이션을 두 개 적을 필요 없이 `@RestController` 하나만으로 같은 효과를 낼 수 있습니다.
아래 코드는 바로 위에서 정의한 컨트롤러와 동일하게 동작합니다.

```kotlin
@RestController
class HomeController {
    @GetMapping("/")
    fun index() = "ok"
```

`RestController`에서는 단순히 스트링으로만 반환하는 경우 언제나 Http 200으로만 응답됩니다.
예제에서는 `ResponseEntity` 객체를 이용하여 응답을 반환하였는데, 해당 객체를 이용하면 Http Status, 헤더 등의 정보를 상황에 알맞게 관리할 수 있습니다.

---

# 3. Model

이번에는 MVC에서 M에 해당하는 **모델**(Model)에 집중해봅시다.
모델은 데이터 저장소를 정의하고, 저장소에서 가져온 데이터를 가공할 수 있는 기능을 제공합니다.
일반적으로 데이터베이스와 밀접하게 관련이 있습니다.
모델에서 가져온 데이터는 컨트롤러(Controller)에 전달되어 뷰(View)에 보여지게 됩니다.

## 3.1 의존성 추가

데이터베이스와 연결하기 위해 아래와 같은 의존성들을 추가해줍니다.

```kotlin
plugins {
    ...
    kotlin("plugin.jpa") version "1.6.21"  // 추가
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")  // 추가
    implementation("org.springframework.boot:spring-boot-starter-jdbc")  // 추가
    implementation("org.postgresql:postgresql")  // 추가
    ...
}
```

**spring-boot-starter-data-jpa**를 추가하면 자바 ORM으로 JPA 및 Hibernate를 사용할 수 있습니다.
**spring-boot-starter-jdbc**에는 자바 프로그램과 DB를 연결해주는 인터페이스가 포함되어 있습니다.
**org.postgresql**은 데이터베이스와 연결할 드라이버를 위한 라이브러리입니다.

DB 연결을 위해 설정 파일에 아래와 같이 작성합니다.

```yml
# application-local.yml
spring:
  datasource:
    driver-class-name: org.postgresql.Driver
    url: jdbc:postgresql://localhost:5432/dbname
    username: user
    password: password
```

## 3.2 Entity

**엔티티**(Entity)는 데이터베이스와의 연관 관계를 정의한 클래스입니다.
보통 하나의 테이블에 하나의 엔티티가 매핑됩니다.

아래와 같이 회원 테이블 스키마에 알맞게 정의할 수 있습니다.

```kotlin
enum class UserPermission {
    ANONYMOUS,
    NORMAL,
    ADMIN
}

@Entity
@Table(name = "t_auth_user")
class AuthUser (

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    var userName: String,

    var userEmail: String,

    var password: String? = null,

    @Enumerated(EnumType.STRING)
    var userPermission: UserPermission = UserPermission.NORMAL,

    var isActive: Boolean = true,

    var createdDtm: LocalDateTime = LocalDateTime.now()
)
```

위와 같이 `@Entity` 어노테이션을 작성하여 해당 클래스가 엔티티라는 것을 명시할 수 있습니다.
일반적으로 엔티티 클래스에는 setter를 설정하지 않는 것이 관례입니다.

엔티티는 class로 작성할 수도 있고 data class로 작성할 수도 있지만, 보통은 class를 사용하는 것을 권장합니다.

## 3.2 Repository

**Repository**는 엔티티를 이용해 데이터를 가지고 올 수 있는 인터페이스입니다.

```kotlin
@Repository
interface AuthUserRepository : JpaRepository<AuthUser, Long>
```

일반적으로 `JpaRepository`를 상속받아 사용합니다.
<> 내부에는 엔티티 클래스와 pk 필드 타입을 입력합니다.
또한 `@Repository` 어노테이션을 선언하여 해당 인터페이스가 Repository인것을 나타낼 수 있습니다.

내부에 아무 메소드도 정의하지 않았지만 기본적으로 사용할 수 있는 표준 메소드들이 있습니다.
또한 추가적으로 필요한 메소드는 인터페이스 내부에서 선언하여 활용할 수 있습니다.

## 3.3 Service

비즈니스의 로직이 복잡해지면 컨트롤러에서만 처리하는 것이 아니라 **서비스**(Service)라는 하나의 계층을 더 만들어서 해당 부분에서 처리합니다.

아래 회원 테이블에서 특정 유저의 정보를 조회하는 API를 작성하였습니다.

```kotlin
@Service
class UserService {

    @Autowired
    lateinit var authUserRepository: AuthUserRepository

    fun getUserById(userId: Long): AuthUser {
        return authUserRepository.findByIdOrNull(userId)
            ?: throw Exception("User does not exist!")
    }
}
```

서비스 클래스에는 `@Service` 어노테이션을 붙여줍니다.
기능적으로 `@Repository`, `@Service` 모두 `Component` 클래스를 상속하고 있어서 기능적으로는 큰 차이가 없지만 기능을 명시적으로 표기하기 위해 `@Component`보다는 적절하게 어노테이션을 붙여주는것을 권장합니다.

```kotlin
@RestController
@RequestMapping("/user")
class UserController {

    @Autowired
    private lateinit var userService: UserService

    @GetMapping("/{user-id}")
    fun getUser(@PathVariable("user-id") userId: Long): ResponseEntity<AuthUser> {
        return ResponseEntity<AuthUser>(userService.getUserById(userId), HttpStatus.OK)
    }
}
```

그리고 컨트롤러에서 서비스의 로직과 연결합니다.

URI 경로를 변수로 이용하려면 `path` 인자를 선언할 때 대괄호 `{}` 내부에 변수명을 입력합니다.
또한 `@PathVariable`를 이용하여 경로에 입력된 값을 컨트롤러 내부로 가져올 수 있습니다.

어플리케이션 실행후 아래와 같이 요청하면 데이터베이스에 있는 사용자 정보를 반환합니다.

```shell
GET /user/1
Response
{
    "id": 1,
    "userName": "miintto.log@gmail.com",
    "userEmail": "miintto.log@gmail.com",
    "password": "$2b$12$XCJfOKShSppXRwuX",
    "userPermission": "ADMIN",
    "createdDtm": "2023-04-15T15:38:51.307531",
    "active": true
}
```

프로젝트 구조는 다음과 같이 작성하였습니다.

```shell
└── com.miintto.matstagram
    ├── api
    │   ├── home
    │   └── user
    │       ├── domain
    │       │   └── AuthUser
    │       ├── repository
    │       │   └── AuthUserRepository
    │       ├── UserController
    │       └── UserService
    └── MatstagramApplication.kt
```

---

References

- [스프링 MVC - 구조 이해](https://catsbi.oopy.io/f52511f3-1455-4a01-b8b7-f10875895d5b)
- [[Spring] @Controller와 @RestController 차이](https://mangkyu.tistory.com/49)
- [[Spring Boot] ResponseEntity란 무엇인가?](https://devlog-wjdrbs96.tistory.com/182)
- [SpringBoot Kotlin으로 작성하기 - woolog 개발자 울이](https://www.woolog.dev/backend/spring-boot/springboot-kotlin-simple-starter/)
- [엔티티(Entity) - jayjay28.log](https://velog.io/@jayjay28/엔티티Entity)
- [jpa entity 에 data class 를 사용해도 될까?](https://multifrontgarden.tistory.com/286)
- [Spoqa 기술 블로그 - 스포카에서 Kotlin으로 JPA Entity를 정의하는 방법](https://spoqa.github.io/2022/08/16/kotlin-jpa-entity.html)
- [[Spring] JpaRepository 이용](https://araikuma.tistory.com/329)
