---
layout: post
title: "Spring+Kotlin 프로젝트 시작"
category: spring
tags: 
  - spring
  - spring boot
  - kotlin
  - gradle
banner: "/img/posts/spring-initialize-banner.png"
---

여러 채용 사이트에서 서버 개발자 공고를 확인해 보면 절반 이상은 스프링 프레임워크 경험자를 우대하고 있는 것을 확인할 수 있습니다.
이러한 현상의 배경에는 우리나라 공공기관에 스프링 기반의 전자정부 프레임워크가 도입되면서 대다수의 IT기업들 또한 자바+스프링을 사용하게 된 이유가 큽니다.
하나의 프레임워크에 편중되는 현상이 바람직해 보이진 않지만, 많이 사용되는 만큼 생태계가 잘 구축되어 꽤 높은 수준의 노하우가 축적되어 있다는 점은 장점이 되기도 합니다.

필자가 다니는 회사에서는 python + django 환경이 대부분이라 스프링을 접할 기회가 전무하였지만, 모처럼의 이유로 스프링 기반 프로젝트도 다루게 되어 새로운 프레임워크에 대한 학습이 필요해졌습니다.
이번 기회에 독자적인 스프링 어플리케이션을 그것도 자바가 아닌 코틀린 기반으로 작성해 보면서 기본적인 구조에 대해 학습해 보려고 합니다.

---

# 1. Start Project

처음 시작은 기존 Python으로 되어있는 프로젝트 하나를 옮겨보려고 합니다.
기존 구축되었던 프로젝트를 코틀린 기반으로 재작성해 보면서 스프링에서는 어떻게 구현되는지 파악해 보면 이해가 쉬울 것 같아, FastAPI로 작성했던 [miintto/matstagram](https://github.com/miintto/matstagram) 프로젝트를 선택해서 스프링으로 다시 작성해 보겠습니다.

## 1.1 Spring Initializer

초기 프로젝트는 IntelliJ 환경에서 생성하거나 [Spring Initializer](https://start.spring.io) 사이트에서 만들 수 있습니다.
저는 Spring Initializer 사이트에서 생성하였습니다.

<img src="/img/posts/spring-initialize-initializer.png" style="max-width:720px"/>

자바는 17이 현재 최신 LTS 버전이지만 아직 보편화되지 않은 것 같아서 **자바 11** 버전을 사용하기로 했습니다.
주 사용 언어로는 **코틀린**을 선택했습니다.
스프링 부트 3.x 버전은 자바 17부터 지원하기 때문에 2.x 의 최신 버전인 **스프링 부트 2.7.12** 버전을 채택했습니다.
빌드 도구는 **Gradle + 코틀린**을 선택했습니다.
Gradle에 대해서는 아래서 좀 더 자세하게 설명하겠습니다.

화면 하단의 'GENERATE' 버튼을 누르면 JAR 파일이 다운로드 되는데, 압축을 풀어주면 아래와 같은 구조의 프로젝트를 확인할 수 있습니다.

```bash
$> tree
.
├── gradle
│   └── wrapper
│       ├── gradle-wrapper.jar
│       └── gradle-wrapper.properties
├── src
│   ├── main
│   │   ├── kotlin
│   │   │   └── com
│   │   │       └── miintto
│   │   │           └── matstagram
│   │   │               └── MatstagramApplication.kt
│   │   └── resources
│   │       └── application.properties
│   └── test
│       └── kotlin
│           └── com
│               └── miintto
│                   └── matstagram
│                       └── MatstagramApplicationTests
├── .gitignore
├── build.gradle.kts
├── gradlew
├── gradlew.bat
└── settings.gradle.kts
```

## 1.2 Spring vs Spring Boot

흔히 스프링과 스프링 부트의 개념이 헷갈릴 수 있습니다.
개발시 둘 다 동시에 다루지만 서로 다른 의미이므로 혼동하지 않도록 합니다.

**스프링**은 엔터프라이즈용 자바 어플리케이션을 개발할 수 있도록 하는 프레임워크입니다.
기존 자바 EE 환경에서 일일이 구현해야 하는 공통적인 부분을 스프링에 담아 개발자들이 좀 더 비즈니르 로직에만 집중할 수 있도록 개선된 오픈소스입니다.
후속편에서 사용할 스프링 Data JPA, Security와 같은 기능들도 프레임워크 내부에 구현되어 있어서 그저 가져다 쓰기만 하면 됩니다.
하지만 단점으로 라이브러리 의존성 혹은 기타 환경 설정 사항들을 위해 XML 형식으로 작성할 내용이 많다는 점이 있습니다.

**스프링 부트**는 이러한 스프링 프로젝트를 쉽게 개발할 수 있도록 초기 세팅을 보조해주는 프레임워크입니다.
내부에 톰캣과 같은 웹서버를 내장하고 있어서 바로 서버를 실행할 수 있으며, starter를 지원하여 필요한 의존성 라이브러리들을 간단하게 설치 할 수 있습니다.

---

# 2. Application Properties

`application.properties` 파일은 외부 설정을 위한 파일입니다.
key, value 형식으로 작성 가능하며 `@Value` 어노테이션으로 소스 코드 내부로 불러올 수 있습니다.

`application.properties` 대신 `application.yml` 파일에서 YAML 형식으로 기입할 수도 있습니다.
계층적으로 작성할 수 있어서 가독성이 좋다는 장점이 있습니다.
저는 해당 방식을 차용하였습니다.

해당 파일 내부에서 정의하는 프로필에 따라 환경 구분이 가능한데, 일반적으로 local, develop, production 등 각 환경별로 별도의 파일로 분리하여 관리합니다.
파일 네이밍을 `application-{프로필}.properties` 혹은 `application-{프로필}.yml` 형태로 작성하여 프로필을 구분할 수 있습니다.

아래와 같이 YAML 파일을 각각 생성하고

```shell
└── resources
    ├── application.yml
    ├── application-dev.yml
    ├── application-local.yml
    ├── application-prod.yml
    └── application-test.yml
```

`application.yml`에서는 저들 중 원하는 환경만 바라보도록 합니다.

```yml
# application.yml
spring.profiles.active: local
```

만일 테스트 환경에서 실행하려는 경우 해당 값을 `local` 대신 `test`로 변경 후 실행합니다.

---

# 3. Gradle

## 3.1 Build Tool이란?

자바, 코틀린과 같은 JVM 기반 언어에서는 소스 코드 작성 후 **컴파일** 과정이 필수적입니다.
또한 컴파일 후 생성된 여러 클래스 파일들을 통합하여 JAR, WAR 같이 실행 가능한 산출물을 생성하는 **빌드** 과정도 필요합니다.
스프링 부트에서는 이러한 번거로운 과정을 간단히 하기 위해 빌드 도구를 지원합니다.

스프링에서 Ant, Maven, Gradle등의 빌드 도구를 사용할 수 있는데, 최근에는 Gradle을 사용하는 추세입니다.
Gradle은 Groovy DSL, Kotlin DSL 두가지 언어로 작성 가능합니다.
기존에는 Groovy만 사용가능 했지만 현재는 Kotlin도 지원하고 있습니다.

## 3.2 build.gradle

Gradle은 루트 경로의 `build.gradle.kts` 파일에 기입된 내용을 기준으로 빌드를 진행합니다.
자바 환경에서는 `build.gradle` 네이밍으로 사용됩니다.
해당 파일에는 필요한 플러그인, 외부 라이브러리, 저장소 정보 등이 기입되어 있습니다.
파일을 열어보면 아래와 같은 구성을 확인할 수 있습니다.

```kotlin
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    id("org.springframework.boot") version "2.7.12"
    id("io.spring.dependency-management") version "1.0.15.RELEASE"
    kotlin("jvm") version "1.6.21"
    kotlin("plugin.spring") version "1.6.21"
}

group = "com.miintto"
version = "0.0.1-SNAPSHOT"
java.sourceCompatibility = JavaVersion.VERSION_11

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

tasks.withType<KotlinCompile> {
    kotlinOptions {
        freeCompilerArgs = listOf("-Xjsr305=strict")
        jvmTarget = "11"
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
}
```

해당 파일을 변경할 때마다 혹은 초기 프로젝트 생성 시에는 아래와 같이 오른쪽 위에 코끼리 모양의 아이콘이 생성됩니다.

<img src="/img/posts/spring-initialize-load-gradle-change.png" style="max-width:720px"/>

클릭시 변경된 내용을 로컬 환경에 반영되며, 초기 실행시에는 루트 디렉토리에 .gradle/ 폴더가 생성됩니다.

## 3.3 Gradle Wrapper

만일 로컬에 설치된 Gradle의 버전과 프로젝트에 정의된 버전이 일치하지 않는 경우 정상적으로 빌드가 이루어지지 않습니다.
이를 예방하기 위해 Gradle을 직접 실행하지 않고 Gradle Wrapper를 이용하는 방법이 권장되고 있습니다.
Gradle Wrapper는 명령때마다 `gradle-wrapper.properties` 파일에 정의된 버전과 알맞은 Gradle을 가져와 실행합니다.
이로 인해 여러 프로젝트를 관리하는 경우 각각 정의된 Gradle 버전이 달라도 빌드하는데 큰 문제가 없습니다.

Gradle Wrapper는 루트 디렉토리에 위치한 `gradlew`, `gradlew.bat` 파일을 이용하여 명령어를 사용할 수 있습니다.
해당 파일 내부에는 Gradle Wrapper 실행을 위한 스크립트가 작성되어 있습니다.
맥을 비롯한 유닉스 환경에서는 `gradlew`을 사용하고, 윈도우에서는 `gradlew.bat`을 사용하면 됩니다.

## 3.4 Build and Run

`./gradlew build` 명령으로 작성한 파일을 빌드합니다.
초기 실행시 시간이 다소 걸릴 수 있습니다.

```shell
$> ./gradlew build
<-------------> 0% EXECUTING [2s]
> :compileKotlin > Resolve dependencies of :kotlinCompilerPluginClasspathMain

```

실행이 끝나면 루트 경로에 build/ 디렉토리가 생성됩니다.
build/libs/ 경로에 .jar 확장자를 가진 파일이 존재하는데 해당 파일을 실행하면 어플리케이션을 구동시킬 수 있습니다.

`./gradlew bootrun` 명령어로 빌드와 서버 구동을 한 번에 할 수 있습니다.

```shell
$> ./gradlew bootrun
Starting a Gradle Daemon, 1 incompatible and 5 stopped Daemons could not be reused, use --status for details
<==-----------> 16% EXECUTING [34s]
> :compileKotlin
> IDLE

  .   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/
 :: Spring Boot ::               (v2.7.12)

2023-06-06 13:31:01.453  INFO 87239 --- [           main] c.m.matstagram.MatstagramApplicationKt   : Starting MatstagramApplicationKt using Java 11.0.11 on user.local with PID 87239 (/your/project/path/build/classes/kotlin/main started by user in /your/project/path)
2023-06-06 13:31:01.455  INFO 87239 --- [           main] c.m.matstagram.MatstagramApplicationKt   : The following 1 profile is active: "local"
2023-06-06 13:31:02.040  INFO 87239 --- [           main] c.m.matstagram.MatstagramApplicationKt   : Started MatstagramApplicationKt in 1.057 seconds (JVM running for 1.73)

BUILD SUCCESSFUL in 41s
4 actionable tasks: 4 executed
```

아직 톰캣이 활성화되지 않았기 때문에 실행 후 프로세스가 바로 종료됩니다.

---

References

- [Getting Started - Building web applications with Spring Boot and Kotlin](https://spring.io/guides/tutorials/spring-boot-kotlin/)
- [스프링과 스프링부트(Spring Boot) - 정의, 특징, 사용 이유, 생성 방법](https://www.codestates.com/blog/content/스프링-스프링부트)
- [컴파일과 빌드 차이점](https://freezboi.tistory.com/39)
- [[Java] Gradle, Groovy Gradle, Kotlin Gradle](https://kdhyo98.tistory.com/87)
- [Spring Boot에서 application.yml vs application.properties 차이점](https://recordsoflife.tistory.com/434)
- [gradlew와 gradle.bat 을 사용해 gradle 설치하지 않고 사용하기](https://kotlinworld.com/314)
