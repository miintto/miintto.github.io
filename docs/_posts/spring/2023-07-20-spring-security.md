---
layout: post
title: Spring Security
category: spring
tags: 
  - spring
  - security
  - filter chain proxy
  - jwt
toc: true
thumbnail: "/img/thumbnails/spring-security.png"
---

구조적으로 탄탄한 어플리케이션을 설계한다면 반드시 인증과 인가 기능을 고려하게 될 겁니다.
여기서 **'인증'**이란 들어오는 요청에 대해 신원을 확인하는 작업을 말하는 것이고, **'인가'**란 식별된 요청이 자원에 접근할 수 있는 권한을 가지고 있는지 검증하는 과정을 의미합니다.
이러한 기능을 어플리케이션 내부에 구현하여 리소스에 불특정 다수가 마음대로 접근할 수 없도록 보호할 수 있습니다.

**Spring Security**를 이용하면 스프링 환경에서 기본적인 보안 기능을 적용할 수 있습니다.
이미 내장된 기능들이 많아 적절히 조합하여 사용하기만 하면 됩니다.

> 이하 내용은 Spring Security 5.7.8 기준으로 작성하였습니다.

---

# 1. Architecture

Spring Security는 **필터**(Filter) 기반으로 작동합니다.
기본적으로 스프링에서는 요청이 들어오고 나갈 때마다 경우 여러 필터들을 거치게 되는데, 해당 필터 사이에 인증을 담당하는 필터 한 층을 추가하여 보안 관련 작업을 진행하게 됩니다.

해당 필터는 `FilterChainProxy` 클래스 타입으로 겉으로는 하나의 필터처럼 보이지만 내부에는 여러 필터들과 연결되어 있습니다.
따라서 해당 `FilterChainProxy` 실행시 연결된 인증 필터들이 순차적으로 실행되면서 로그아웃, 동시 세션, 권한 등을 검증하게 됩니다.

<img src="/img/posts/spring-security-flow.png" style="max-width:600px"/>

해당 `FilterChainProxy`는 **springSecurityFilterChain** 라는 이름으로 Bean에 등록되어 어플리케이션 실행시 필터 사이에 추가됩니다. 해당 필터가 생성될 때 다음의 과정을 거칩니다.

1. `WebSecurityConfigurerAdapter`와 같은 config 클래스에서 인증 및 인가에 대한 구성을 정의합니다.
2. `HttpSecurity` 내부에서 해당 정책을 바탕으로 알맞은 필터를 선별 및 정렬하여 `SecurityFilterChain` 객체를 생성합니다.
3. `WebSecurity`는 각 설정으로부터  `SecurityFilterChain`을 가져온 후 리스트에 담아 `FilterChainProxy`를 생성합니다.

Security config 클래스 작성시 기존에는 `WebSecurityConfigurerAdapter`를 상속받았지만 Spring Security 5.4 이후 버전에서는 deprecated 되었습니다. 현재는 `SecurityFilterChain`를 `Bean`으로 등록하여 사용하는 방식을 권장하고 있습니다.

---

# 2. Quick Start

Spring Security를 사용하기 위해 아래 의존성을 추가합니다.

```kotlin
dependencies {
    ...
    implementation("org.springframework.boot:spring-boot-starter-security")  // 추가
```

의존성 추가 후 아무 API나 호출해보면 401 에러를 반환합니다.

```shell
$> curl -I localhost:8080/user/1
HTTP/1.1 403 
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

그 현재 이유는 인증 및 인가에 관해 아무 설정도 해주지 않았기 때문입니다.
Spring Security가 적용되는 순간부터 모든 요청은 인증이 되어야지만 자원에 접근이 가능해집니다.

이를 해결하기 위해 config 클래스를 만들어서 어플리케이션에 적용할 보안 구성을 정의해 주어야 합니다.
우선 임시로 모든 요청에 대해 권한 없이 접근이 가능하도록 설정하겠습니다.
아래와 같이 별도 `@Configuration` 클래스를 생성한 후 `Bean`으로 등록한 메소드 내부에 인증/인가 기능들을 정의합니다.

```kotlin
@Configuration
class SecurityConfig {

    @Bean
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        http.authorizeHttpRequests { request -> request.anyRequest().permitAll() }
        return http.build()
    }
}
```

이제 해당 `Bean`은 config 클래스로 인식되어 filter chain을 생성합니다.
하지만 모든 요청에 대해 `.permitAll()`이 적용되어 있어서 인증 없이 모든 필터를 통과하더라도 큰 이슈 없이 리소스에 접근할 수 있습니다.

다시 어플리케이션을 재시작한 후에 API를 호출하면 다시 정상적으로 동작하는 것을 확인할 수 있습니다.

```shell
$> curl localhost:8080/user/1
{"code":"S001","message":"성공","data":{"id":1,"userName":"miintto",...
```

---

# 3. Authentication with JWT

이번에는 실제 인증 기능을 구현해 보겠습니다.
인증 방식은 흔히 사용하는 JWT를 선택했습니다.
JWT에 대한 자세한 설명은 여기서 다루지 않겠습니다.

## 3.1 JWT Filter

JWT를 사용하기 위해 아래 의존성을 추가합니다.

```kotlin
dependencies {
    ...
    implementation("io.jsonwebtoken:jjwt-api")
    implementation("io.jsonwebtoken:jjwt-impl")
    implementation("io.jsonwebtoken:jjwt-jackson")
```

토큰은 회원가입 및 로그인시 발급되도록 하고, 별도 access 및 refresh 구분 없이 심플하게 access 토큰만 사용하였습니다. 만료 시간은 발급 후 1시간으로 설정하였습니다. 아래 토큰 발급 및 검증을 담당하는 클래스를 작성하였습니다.

```kotlin
@Component
class JwtTokenProvider {

    @Value("\${jwt.secret}")
    private lateinit var jwtSecret: String

    private val accessExpirationInterval = 60 * 60 * 1000L  // 만료시간은 1시간

    private val secretKey: SecretKey
        get() = Keys.hmacShaKeyFor(jwtSecret.toByteArray())

    private val jwtParser: JwtParser
        get() = Jwts.parserBuilder().setSigningKey(secretKey).build()

    fun generateToken(user: AuthUser): String {
        val claims = Jwts.claims().setSubject(user.id.toString())
        claims["userName"] = user.userName
        claims["permission"] = user.userPermission
        return Jwts.builder()
            .setHeaderParam("typ", "JWT")
            .setClaims(claims)
            .setIssuedAt(Date())
            .setExpiration(Date(Date().time + accessExpirationInterval))
            .signWith(secretKey, SignatureAlgorithm.HS256)
            .compact()
    }

    fun validateToken(token: String): Boolean {
        return try {
            jwtParser.parse(token)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun getAuthentication(token: String): Authentication {
        val claims = jwtParser.parseClaimsJws(token).body
        val userDetails = User.builder()
            .username(claims.subject)
            .password("")
            .roles(claims["permission"].toString())
            .build()
        return UsernamePasswordAuthenticationToken(userDetails, "", userDetails.authorities)
    }
}
```
```yml
# application-local.yml
jwt:
  secret: c1ed7355-e0ac-40b1-92d0-0cb5d36d0094
```

토큰 내부에는 사용자 pk, 이름(userName), 권한 정보(permission)를 넣었으며 암호화 알고리즘은 HS256을 사용하였습니다.
해당 알고리즘을 사용하기 위해 별도 키가 필요한데, 키의 길이가 최소 256 비트(String 으로 32자) 이상 되도록 강제하고 있으니 최대한 길게 사용하는 것을 권장드립니다.
해당 키는 설정 파일에서 관리하도록 하였습니다.

일반적인 레퍼런스들을 찾아보면 토큰 디코딩 후 `UserDetailService`를 사용하여 DB로부터 사용자의 정보를 가져오는 예제를 많이 볼 수 있습니다.
어떻게 보면 그런 방식이 좀 더 엄밀해 보이긴 하지만 DB 접근 없이 토큰만으로 인증 및 권한 확인이 가능하다는 JWT의 장점이 무색해지는것 같아 DB 접근 없이 토큰 body만 이용하여 인가 작업을 하도록 구현하였습니다.

이제 실제 `FilterChainProxy`에서 작동할 커스텀 필터를 작성했습니다.

```kotlin
@Component
class JwtAuthenticationFilter : OncePerRequestFilter() {

    @Autowired
    private lateinit var jwtTokenProvider: JwtTokenProvider

    private fun resolveToken(request: HttpServletRequest): String? {
        val token = request.getHeader("Authorization") ?: return null
        val authArray = token.split(" ")
        if (authArray.size != 2) {
            return null
        } else if (authArray[0].lowercase() != "bearer") {
            return null
        }
        return authArray[1]
    }

    private fun setAuthorization(token: String) {
        SecurityContextHolder.getContext().authentication = jwtTokenProvider.getAuthentication(token)
    }

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        val token = resolveToken(request)
        if (token != null && jwtTokenProvider.validateToken(token)) {
            setAuthorization(token)
        }
        filterChain.doFilter(request, response)
    }
}
```

요청 헤더에 `Authorizarion: Bearer eyJ0eXAi..` 형식으로 입력하여 인증되도록 하였습니다.
토큰이 유효한 경우에는 토큰을 파싱한 body에서 인증 정보를 가져와 인증을 완료해주고 아닌 경우에는 별도 작업 없이 그냥 넘어갑니다.

```kotlin
@Configuration
class SecurityConfig {

    @Autowired
    private lateinit var jwtAuthenticationFilter: JwtAuthenticationFilter

    @Bean
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .authorizeHttpRequests { request ->
                request.antMatchers("/auth/**").permitAll()  // '/auth' 하위 uri에서는 인증 없이 허용
                    .anyRequest().authenticated()  // 나머지는 반드시 인증 필요
            }
            .csrf().disable()  // csrf 비활성화
            .formLogin().disable() // form login 비활성화
            .httpBasic().disable()  // 기본 인증 비활성화
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }  // 세션 인증 비활성화
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter::class.java)  // 커스텀 필터 등록
        return http.build()
    }
}
```

먼저 작성했던 Config 클래스를 새 보안 정책에 맞게 다시 작성하였습니다.
현 프로젝트에서는 JWT를 이용한 인증만 진행할 예정이므로 기본적으로 내장되어있는 CSRF, Form 로그인, 세션 인증 등의 기능은 비활성화 합니다.
'/auth' 하위의 URI는 인증 관련 작업시 사용할 예정이라 누구나 접근 가능하도록 하였고, 그 외 나머지 URI에 대해서는 모두 인증된 클라이언트만 접근할 수 있도록 하였습니다.

앞에서 생성한 JWT 인증 필터를 등록하였습니다.
`addFilterBefore()` 메소드를 이용하여 등록하면 특정 필터 바로 앞에 커스텀한 필터를 등록할 수 있습니다.

최초 사용할 토큰을 발급받기 위해 임시로 토큰을 생성하는 API를 작성하였습니다.

```kotlin
@RestController
@RequestMapping("/auth")
class AuthController {
    @Autowired
    private lateinit var authUserRepository: AuthUserRepository

    @Autowired
    private lateinit var jwtTokenProvider: JwtTokenProvider


    @PostMapping("/token")
    fun login(): ApiResponse {
        val user = authUserRepository.findByIdOrNull(1) ?: throw Exception()
        return ApiResponse(Http2xx.SUCCESS, jwtTokenProvider.generateToken(user))
    }
}
```



```shell
POST /auth/token
Status 200
Response
{
    "code": "S001",
    "message": "성공",
    "data": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJz...."
}
```

## 3.2 Exception Handling

이제 인증 관련 에러는 401 에러를 반환하도록 처리하려고 합니다.
[이전에](/docs/spring-exception#3-handle-exception) 작성했던 `RestControllerAdvice`에 예외 처리 메소드를 하나 추가합니다.

```kotlin
enum class Http(val code: String, val message: String, val status: HttpStatus) {
    ...
    UNAUTHENTICATED("F002", "잘못된 인증 정보입니다.", HttpStatus.UNAUTHORIZED)
}
```

```kotlin
@RestControllerAdvice
class ApiExceptionHandler {
    ...
    @ExceptionHandler(value = [AuthenticationException::class])
    fun handleAuthError(e: AuthenticationException): ApiResponse {
        logger.error(e.message)
        return ApiResponse(Http.UNAUTHENTICATED)
    }
```

그리고 인증 에러를 발생시키기 위해 일부러 토큰 없이 호출해보면...

```shell
$> curl localhost:8080/user/1
$> curl -I localhost:8080/user/1
HTTP/1.1 403 
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
...
```

원하는 대로 데이터가 나오지도 않을뿐더러 status 403을 반환하는 것을 확인할 수 있습니다.

해당 에러가 인증 에러로 처리되지 않는 이유는 `HandlerExceptionFilter`에 도달하기 전에 에러가 발생하기 때문입니다. 이를 해결하기 위해 `AuthenticationEntryPoint` 라는 클래스를 활용할 수 있습니다.

<img src="/img/posts/spring-security-authentication-entry-point.png" style="max-width:640px"/>

`AuthenticationEntryPoint`는 인증 필터 중 `ExceptionTranslationFilter` 내부에서 실행됩니다.
해당 필터는 인증 및 인가 부분에서 발생한 에러를 처리하는데, 어플리케이션의 전역적인 예외 처리를 담당하는 `HandlerExceptionResolver`와 연결해 주면 인증 예외 발생시에도 응답 포맷을 커스텀 할 수 있습니다.

위 내용을 구현해 보면 아래와 같이 작성할 수 있습니다.

```kotlin
@Component
class JwtAuthenticationEntryPoint : AuthenticationEntryPoint {

    @Autowired
    @Qualifier("handlerExceptionResolver")
    private lateinit var resolver: HandlerExceptionResolver

    override fun commence(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authException: AuthenticationException
    ) {
        resolver.resolveException(request, response, null, authException)
    }
}
```

```kotlin
@Configuration
class SecurityConfig {

    @Autowired
    private lateinit var jwtAuthenticationEntryPoint: JwtAuthenticationEntryPoint

    @Bean
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .authorizeHttpRequests { request ->
                request.antMatchers("/auth/**").permitAll()
                    .anyRequest().authenticated()
            }
            .csrf().disable()
            .formLogin().disable()
            .httpBasic().disable()
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter::class.java)
            // 생성한 클래스 등록
            .exceptionHandling { it.authenticationEntryPoint(jwtAuthenticationEntryPoint) }
        return http.build()
    }
```

다시 동일하게 토큰 없이 요청해보면 설정해 준 응답 형태와 401 에러가 반환되는 것을 확인할 수 있습니다.

```shell
$> curl localhost:8080/user/1
{"code":"F002","message":"잘못된 인증 정보입니다.","data":null}

$> curl -I localhost:8080/user/1
HTTP/1.1 401 
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
...
```

---

References

- [Getting Started \| Spring Security Architecture](https://spring.io/guides/topicals/spring-security-architecture/)
- [Spring Security, 제대로 이해하기 - FilterChain](https://gngsn.tistory.com/160)
- [Spring Security(2) - 전체 구조와 필터 별 역할 정리](https://dotheright.tistory.com/355)
- [[Spring boot / Kotlin] Spring security + JWT 로그인 구현하기](https://codingdiary99.tistory.com/entry/Spring-boot-Kotlin-Spring-security-JWT-로그인-구현하기)
- [[서버개발캠프] Spring Security + Refresh JWT DB접근없이 인증과 파싱하기](https://velog.io/@tlatldms/서버개발캠프-Spring-security-refreshing-JWT-DB접근없이-인증과-파싱하기)
- [Handle Spring Security Exceptions With @ExceptionHandler \| Baeldung](https://www.baeldung.com/spring-security-exceptionhandler)
- [[Spring Security] Spring Security 예외를 @ControllerAdvice와 @ExceptionHandler를 사용하여 전역으로 처리해보자](https://colabear754.tistory.com/172)

---
