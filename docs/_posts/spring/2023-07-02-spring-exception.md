---
layout: post
title: Spring 어플리케이션 예외 처리
category: spring
tags:
  - spring
  - custom response
  - exception
  - controller advice
thumbnail: "/img/thumbnails/spring-exception.png"
---

개발자가 아무리 코드를 완벽하게 작성했다고 해도 어플리케이션이 항상 개발자가 의도한 대로 돌아가지만은 않습니다.
사람의 실수를 차치하고서라도 서버에 부하가 몰리거나 네트워크 단절되는 등 외부적인 요인에 의해서 충분히 서비스에 장애가 발생할 수 있습니다.

따라서 견고한 어플리케이션을 만들기 위해서는 예외 상황에 대비하여 방어적인 코드 작성이 필요합니다.
그러기 위해서는 어느 정도 발생 가능성 있는 오류에 대해서는 프로그래밍적으로 의도한 에러를 발생시키는 동시에 문제가 되는 부분을 클라이언트에 고지해 줄 수 있어야 합니다.

---

# 1. Custom Response

기본적으로 응답 포맷을 일괄적으로 통일하려고 합니다.

```shell
{
    "code": "코드",  # 0000, F001
    "message": "상태 설명",  # 응답 성공, 유효하지 않은 파라미터
    "data": "응답 데이터"  # 리스트 혹은 스트링 포맷
}
```

먼저 status로 성공 및 실패 여부를 구분하고, 위와 같이 'code'에는 특정 코드값으로 구체적인 상태 정보를 반환하며 'data'에 응답 데이터를 내려주는 방식으로 구성하였습니다.

이를 구현하기 위해 Enum 형태로 각 상황별 코드를 정의하고, `data class`로 응답 형태를 잡아주었습니다.
또한 응답 시 사용했던 `ResponseEntity`를 상속하여 커스텀한 응답 클래스를 만들었습니다.

```kotlin
enum class Http(val code: String, val message: String, val status: HttpStatus) {
    SUCCESS("S001", "성공", HttpStatus.OK),
    CREATED("S002","생성 완료", HttpStatus.CREATED),
    USER_NOT_FOUND("F001", "사용자를 찾을 수 없습니다.", HttpStatus.NOT_FOUND),
    // 필요한 경우 더 추가
}

data class ResponseDto(
    val code: String,
    val message: String,
    val data: Any?
)

class ApiResponse(
    http: Http,
    data: Any?
) : ResponseEntity<ResponseDto>(ResponseDto(http.code, http.message, data), http.status) {

    constructor(http: Http) : this(http, null)  // data를 입력받지 않은 경우에는 null로 처리
}
```

코드는 성공, 실패를 명확하게 구분하기 위해 알파벳과 숫자를 혼용하였습니다.
**S**로 시작하면 성공, **F**로 시작하면 요청 실패 상태로 정의하였고 그 뒤에 숫자 세 개를 순차적으로 부여하여 구분하였습니다.

API 개발 시 반드시 'data' 값을 채워 내려줄 필요가 없는 상황도 있습니다.
이런 경우에는 매번 `data` 값을 `null`로 작성하기 번거로우므로 `data` 인자를 입력하지 않은 경우 `null`로 응답하도록 `ApiResponse` 클래스에 생성자를 추가하였습니다.

컨트롤러에서는 아래와 같이 `ResponseEntity` 대신 `ApiResponse`를 반환하는 방식으로 변경하였습니다.

```kotlin
@GetMapping("/{user-id}")
fun getUser(@PathVariable("user-id") userId: Long): ApiResponse {
    return ApiResponse(Http.SUCCESS, userService.getUserById(userId))
}
```

해당 엔드포인트 요청 시 사용자 정보는 아래와 같이 반환됩니다.

```shell
GET /user/1
Response
{
    "code": "S001",
    "message": "성공",
    "data": {
        "id": 1,
        "userName": "miintto",
        "userEmail": "miintto.log@gmail.com",
        "password": "$2b$12$XCJfOKShSppXRwuX",
        "userPermission": "ADMIN",
        "createdDtm": "2023-04-15T15:38:51.307531",
        "active": true
    }
}
```

어플리케이션 전반적으로 커스텀한 응답 객체를 적용한다면 보다 일관성 있는 어플리케이션을 만들 수 있습니다.

---

# 2. Custom Exception

내부 예외 처리를 위해 `Exception` 클래스를 상속받아 커스텀한 예외 클래스를 작성합니다.

```kotlin
class ApiException(val http: Http, val data: Any?) : Exception(http.message) {

    constructor(http: Http) : this(http, null)

    override fun toString(): String {
        return "ApiException code=${this.http.code} message=${this.http.message} status=${this.http.status}"
    }
}
```

내부 인자로는 응답 클래스 사용 시 만들었던 `Http`를 그대로 활용하였습니다.
해당 인자를 이용하여 에러 발생 시 어떤 status 및 코드값을 클라이언트에 전달할지 지정해 줄 수 있습니다.
`data` 인자는 응답 포맷의 'data' 값으로 쓰일 문자열인데, 특별히 선언하지 않은 경우 기본적으로 `null`로 설정됩니다.

```kotlin
@Service
class UserService {

    fun getUserById(userId: Long): AuthUser {
        return authUserRepository.findByIdOrNull(userId)
            ?: throw ApiException(Http.USER_NOT_FOUND)  // 조회 실패시 에러 발생
    }
```

서비스에서 작성했던 `Exception` 대신 새로 구현한 `ApiException`을 발생시키도록 변경하였습니다.
만일 `Http` 내에 원하는 코드값이 정의되어 있지 않은 경우라도 자유롭게 코드를 추가하여 내부 비즈니스 로직에 반영할 수 있습니다.

---

# 3. Handle Exception

이제 에러를 발생시키는 것에 그치지 않고 발생한 에러를 잘 가공하여 클라이언트로 응답해 봅시다.
해당 기능은 `ControllerAdvice`와 `ExceptionHandler`를 이용하여 처리할 수 있습니다.

`@ExceptionHandler` 어노테이션이 명시된 메소드는 예외 처리 메소드인데, 각 예외 상황마다 처리방식을 정의할 수 있습니다.
해당 메소드는 Controller나 ControllerAdvice 클래스에 작성할 수 있습니다.
예외가 발생한 경우 우선적으로 동일 컨트롤러에서 예외 상황과 매칭되는 ExceptionHandler를 찾아서 처리하며, 컨트롤러에서 처리하지 못한 경우 ControllerAdvice의 알맞은 메소드에서 처리합니다.

`@ControllerAdvice` 어노테이션은 어플리케이션 전역적인 에러 처리를 위해 사용합니다.
**ControllerAdvice**와 **RestControllerAdvice** 모두 사용 가능한데, 둘의 차이는 컨트롤러와 동일하게 응답 시 `@ResponseBody`로 Json형식으로 포맷팅하는지 여부입니다.

```kotlin
@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(value = [ApiException::class])
    fun handleApiException(e: ApiException): ApiResponse {
        return ApiResponse(e.http, e.data)
    }

    @ExceptionHandler(value = [Exception::class])
    fun handleException(e: Exception): ApiResponse {
        return ApiResponse(Http.SERVER_ERROR)  // Http에 추가 코드 정의
    }
} 
```

컨트롤러에서 `ApiException`이 발생한 경우에는 해당하는 코드값으로 응답하고, 그 외의 `Exception`에 대해서도 형식에 맞는 응답을 내려주도록 하였습니다.
어노테이션으로 `@RestControllerAdvice`를 사용하였으므로 메소드 리턴값은 컨트롤러와 같은 방식으로 `ApiException`를 반환하였습니다.

아래는 Spring MVC에서 에러가 처리되는 과정을 도식화하였습니다.

<img src="/img/posts/spring-exception-flow.png" style="max-width:720"/>

1. 어플리케이션이 실행되면 작성했던 `RestControllerAdvice` 클래스는 `ExceptionHandlerExceptionResolver` 내부 캐시 데이터에 저장됩니다.
2. 컨트롤러 실행 중 에러가 발생하면 해당 에러는 `HandlerExceptionResolver`에 전달됩니다.
3. 여러 resolver 중 `ExceptionHandlerExceptionResolver`는 캐시 내부의 advice에서 에러에 알맞은 `ExcetionHandler`를 가져와 처리합니다.
4. 처리된 응답을 다시 `DispatcherServlet`으로 넘겨줍니다.


---

References

- [방어적 프로그래밍(Defensive programming), 방어 코딩(defensive coding) — 걷고 나니 길](https://a-road-after-walking.tistory.com/54)
- [API Response 포맷에 관한 고찰](https://blog.lyunho.kim/api-response)
- [[Spring] 스프링의 다양한 예외 처리 방법(ExceptionHandler, ControllerAdvice 등) 완벽하게 이해하기 - (1/2) - MangKyu's Diary](https://mangkyu.tistory.com/204)
