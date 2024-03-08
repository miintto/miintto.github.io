---
layout: post
title: Spring 로깅
category: spring
tags: 
  - spring
  - logging
  - interceptor
  - ecs logging
thumbnail: "/img/thumbnails/spring-logging.png"
---

어플리케이션이 이상 없이 잘 돌아가고 있는지 확인하기 위해 필요한 부분에 로깅 메시지를 남겨두는 것은 중요합니다.
로그가 적절하게 잘 남아있다면 장애 발생 시 신속하게 원인을 찾을 수 있으며 추후 어플리케이션 성능 측정 등에도 활용될 수 있습니다.

---

# 1. Dependency

코틀린에서 로깅 모듈을 사용하기 위해 `build.gradle.kts` 파일에 다음 의존성을 추가합니다.

```kotlin
dependencies {
    ...
    implementation("io.github.microutils:kotlin-logging-jvm")  // 추가
```

위 모듈을 이용하여 아래와 같은 방식으로 로그를 남길 수 있습니다.

```kotlin
import mu.KotlinLogging

val logger = KotlinLogging.logger {}
logger.info("여기에 메시지 작성~")
```

---

# 2. Configurations

어플리케이션 설정 파일에 다음과 같이 기입합니다.

```yml
# application-local.yml
logging:
  config:
    classpath: logback.xml
```

그리고 logback.xml 파일에 로그와 관련된 내용을 기입합니다.
해당 파일은 설정 파일과 같은 resources/ 디렉토리에 위치하도록 합니다.

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE configuration>

<configuration>
  <property name="LOG_FILE_PATH" value="logs"/>
  <property name="LOG_FILE_NAME" value="api"/>

  <!-- Appender 정의 -->
  <appender name="TEXT_CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
      <charset>UTF-8</charset>
      <pattern>%d [%-5level] %logger{35} - %msg%n</pattern>
    </encoder>
  </appender>

  <appender name="TEXT_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
    <file>${LOG_FILE_PATH}/${LOG_FILE_NAME}.log</file>
    <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
      <fileNamePattern>${LOG_FILE_PATH}/${LOG_FILE_NAME}_%d{yyyy-MM-dd}.%i.log</fileNamePattern>
      <maxFileSize>100MB</maxFileSize>
      <maxHistory>10</maxHistory>
      <totalSizeCap>1GB</totalSizeCap>
    </rollingPolicy>
    <encoder>
      <charset>UTF-8</charset>
      <pattern>%d [%-5level] %logger{35} - %msg%n</pattern>
    </encoder>
  </appender>

  <!-- Logger 정의 -->
  <root level="INFO">
    <appender-ref ref="TEXT_CONSOLE"/>
    <appender-ref ref="TEXT_FILE"/>
  </root>
</configuration>
```

**Appender**는 로그 기록 작업을 수행하는 클래스입니다.
단순히 콘솔 화면에 출력하거나(ConsoleAppender), 로그 내역을 파일로 출력하는(FileAppender) 등 여러 appender를 활용하여 로그를 기록할 수 있습니다.
`<appender>` 태그 내부에 정의할 수 있습니다.
더 자세한 appender에 대해서는 [여기](https://logback.qos.ch/manual/appenders.html)에서 확인할 수 있습니다.

로그 메시지 포맷은 <i>'날짜 [레벨] 로거 - 메시지'</i> 형태로 출력되도록 하였습니다.
`<pattern>` 태그에서 설정할 수 있습니다.
주로 사용하는 패턴은 아래와 같습니다.

- `%d` / `%date` : 날짜
  - `%d` - 2023-07-10 16:27:02,460
  - `%date` - 2023-07-10 16:27:02,460
  - `%date{yyyy-MM-dd HH:mm:ss}` - 2023-07-10 16:27:02
  - `%date{dd MMM yy HH:mm:ss.SSS}` - 10 Sep 23 16:27:02.460
- `%-5level`
  - 로그 레벨 (TRACE, DEBUG, INFO, WARN, ERROR)
- `%thread`
  - 스레드 이름
- `%logger{n}`:
  - 로거 정보. 최대 n자까지 기입합니다.
- `%m` / `%msg` / `%message`
  - 로그 메시지

---

# 3. Logging each Request

매 요청마다 request, response 정보(메소드, url 등)를 로깅 하려고 합니다.
이때 스프링 MVC 중간에 거치는 `HandlerInterceptor` 단계에서 로그를 남기려고 합니다.

<img src="/img/posts/spring-logging-handler-intercepter.png" style="max-width:720px"/>

**HandlerInterceptor**는 컨트롤러가 실행되기 이전, 혹은 컨트롤러 이후에 작업을 처리해야 하는 경우에 사용합니다.
상속받은 **`preHandle`**, **`postHandle`**, **`afterCompletion`** 메소드 내부에 필요한 프로세스를 작성할 수 있습니다.
메소드별 처리 로직은 아래와 같습니다.

- `preHandle`: 컨트롤러로 넘어가기 전에 실행됩니다.
- `postHandle`: 컨트롤러의 모든 작업을 마친 후에 실행됩니다. 컨트롤러 처리 중 에러가 발생한 경우 실행되지 않습니다.
- `afterCompletion`: 컨트롤러 이후 에러 처리 및 View 렌더링 작업이 마무리되면 실행됩니다.

이를 이용하여 `preHandle` 메소드에서는 request 정보를, `afterCompletion` 메소드에서는 response 정보를 로깅 하도록 하겠습니다.

```kotlin
class MatstagramInterceptor: HandlerInterceptor {

    private val logger = KotlinLogging.logger {}

    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        // Request 로깅
        logger.info( "Request ${getRequestURI(request)}")
        return super.preHandle(request, response, handler)
    }

    override fun afterCompletion(request: HttpServletRequest, response: HttpServletResponse, handler: Any, ex: Exception?) {
        // Response 로깅
        logger.info( "Response ${getRequestURI(request)} - ${response.status}")
        super.afterCompletion(request, response, handler, ex)
    }

    private fun getRequestURI(request: HttpServletRequest): String {
        return if (request.queryString != null) {
            "${request.method} ${request.requestURI}?${request.queryString}"
        } else {
            "${request.method} ${request.requestURI}"
        }
    }
}
```

로깅 포맷은 <i>Method + URL ( + Query Param)</i> 형태로 구성하였고 응답 시에는 추가로 status까지 넣어주었습니다.
단순 정보 로깅이므로 로그 레벨은 info로 설정하였습니다.

이제 작성한 interceptor를 등록해 주어야 합니다.

```kotlin
@Configuration
class WebMvcConfiguration : WebMvcConfigurer {

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(MatstagramInterceptor()).addPathPatterns("/**")
    }
}
```

`addInterceptors` 메소드에서는 interceptor를 내부 registry에 등록할 수 있습니다.
`"/**"` 패턴은 모든 URI 경로에 대해 해당 interceptor를 적용한다는 의미입니다.

어플리케이션 실행 후 API를 호출할 때마다 아래와 같이 로그가 남는 모습을 확인할 수 있습니다.

```shell
2023-07-10 16:28:52,496 [INFO ] c.m.m.c.i.MatstagramInterceptor - Request GET /user/1
2023-07-10 16:28:52,555 [INFO ] c.m.m.c.i.MatstagramInterceptor - Response GET /user/1 - 200
```

---

# 4. Logging Body Stream

이제 요청 시 넣어주었던 body 및 응답 데이터도 로깅 해봅시다.

다만 이때 문제가 있는데, 해당 데이터는 stream 형태로 되어있는데 한 번밖에 읽지 못합니다.
즉, 로깅을 하기 위해 preHandle 단계에서 요청 body를 가져와 버리면 정작 필요한 컨트롤러에서는 해당 데이터를 사용할 수 없다는 의미입니다.

<img src="/img/posts/spring-logging-request-wrapper.png" style="max-width:720px"/>

이를 해결하기 위해서 requst 및 response를 wrapper 클래스로 한 번 감싸주어 처음 읽을때는 내부에 캐싱 해두었다가 이후 호출하는 경우에는 캐싱된 데이터를 반환하도록 하였습니다.

```kotlin
class ContentCachingRequestWrapper(request: HttpServletRequest) : HttpServletRequestWrapper(request) {
    private var content = ByteArrayOutputStream()  // body가 저장될 공간

    override fun getInputStream(): ServletInputStream {
        IOUtils.copy(super.getInputStream(), content)  // 최초에 stream을 읽어서 캐싱합니다.

        return object : ServletInputStream() {
            private var buffer = ByteArrayInputStream(content.toByteArray())
            override fun read(): Int = buffer.read()
            override fun isFinished(): Boolean = buffer.available() == 0
            override fun isReady(): Boolean = true
            override fun setReadListener(listener: ReadListener?) = throw RuntimeException("Not implemented")
        }
    }

    val contentAsByteArray: ByteArray
        get() = this.inputStream.readAllBytes()  // 이후 호출시에는 캐시된 body를 반환
}
```

위와 같이 데이터를 가져오기 위해 `getInputStream()`를 호출하는 경우 내부 공간에 미리 캐싱해 두고, 리턴값으로 캐싱된 데이터를 읽어가도록 구성된 `ServletInputStream` 클래스를 반환합니다.

이제 request를 작성했던 `ContentCachingRequestWrapper`로 감싸주기 위해 필터를 추가합니다.

```kotlin
@Component
class RequestWrappingFilter : OncePerRequestFilter() {

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        val wrapRequest = ContentCachingRequestWrapper(request)
        val wrapResponse = ContentCachingResponseWrapper(response)
        filterChain.doFilter(wrapRequest, wrapResponse)
        wrapResponse.copyBodyToResponse()
    }
}
```

Response에 대응되는 클래스 `ContentCachingResponseWrapper`는 이미 스프링 프레임워크 내부에 구현되어 있으므로 그대로 가져와서 사용하도록 합니다.

이전에 생성했던 interceptor에서 다시 로깅 작업을 추가합니다.
Request body의 경우 POST 메소드와 같이 데이터가 존재하는 경우에만 로깅 하도록 하였습니다.


```kotlin
class MatstagramInterceptor: HandlerInterceptor {

    private val logger = KotlinLogging.logger {}

    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        logger.info( "Request ${getRequestURI(request)}")
        val wrapRequest = request as ContentCachingRequestWrapper
        val requestBody = String(wrapRequest.contentAsByteArray, Charsets.UTF_8)
        if (requestBody.isNotBlank()) {
            logger.info("Request Body - $requestBody")  // 요청 body 로깅
        }
        return super.preHandle(request, response, handler)
    }

    override fun afterCompletion(request: HttpServletRequest, response: HttpServletResponse, handler: Any, ex: Exception?) {
        logger.info( "Response ${getRequestURI(request)} - ${response.status}")
        val wrapResponse = response as ContentCachingResponseWrapper
        val responseBody = String(wrapResponse.contentAsByteArray, Charsets.UTF_8)
        logger.info("Response Body - $responseBody")  // 응답 데이터 로깅
        super.afterCompletion(request, response, handler, ex)
    }

}
```

다시 API를 호출하면 이번엔 요청/응답 데이터까지 기입되는 것을 확인할 수 있습니다.

```shell
2023-07-10 16:29:03,225 [INFO ] c.m.m.c.i.MatstagramInterceptor - Request GET /user/1
2023-07-10 16:29:03,276 [INFO ] c.m.m.c.i.MatstagramInterceptor - Response GET /user/1 - 200
2023-07-10 16:29:03,276 [INFO ] c.m.m.c.i.MatstagramInterceptor - Response Body - {"code":"S001","message":"성공","data":{"id":1,"userName": ...
```

---

References

- [Spring Boot, Kotlin, 로깅 정책 수립 및 방법 정리](https://jsonobject.tistory.com/500)
- [OKKY - Spring Boot, Kotlin, 로거 설정하기](https://okky.kr/articles/890310)
- [Chapter 6: Layouts - Logback](https://logback.qos.ch/manual/layouts.html)
- [Spring Boot 에서 log를 남기는 방법 - Spring log 남기기 — 천천히 올바르게](https://huisam.tistory.com/entry/springlogging)
- [[Spring Boot] Request body, Response body 로깅 하는 법 (with 코틀린) — mopil devlog](https://mopil.tistory.com/74#%25--%25--%25EC%25--%25AC%25EC%25A-%25--%25EC%25A-%25--%25EC%25-B%25-D%25---%25--%25EC%25--%25-C%25EB%25B-%25--%25EB%25A-%25BF%25--Reqeust%25-C%25--Response%25EB%25-A%25--%25--%25EB%25-B%25A-%25--%25ED%25--%25-C%25EB%25B-%25--%25EB%25A-%25-C%25--%25EC%25-D%25BD%25EC%25-D%25--%25--%25EC%25--%25--%25--%25EC%25-E%25--%25EB%25-B%25A-)
