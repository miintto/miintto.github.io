---
layout: post
title: "Rust의 소유권"
category: rust
tags:
  - rust
  - cargo
  - ownership
toc: true
thumbnail: "/img/thumbnails/rust.png"
---

저는 주로 파이썬을 사용했지만 최근 들어 러스트(Rust)에도 관심을 두기 시작했습니다.
최근 떠오르고 있는 라이브러리 관리 툴 [**uv**](/docs/python-uv)나 Meta에서 개발 중인 타입 체커 [**pyrefly**](/docs/meta-pyrefly)처럼 성능이 필요한 부분에서 러스트가 활용되는 것을 바라보면서 러스트가 가진 매력이 보였습니다.
이러한 흐름 속에서 자연스럽게 러스트라는 언어에 대해 더 깊이 알아가고 싶다는 생각이 들었습니다.

# 1. Ownership

러스트의 문법과 철학 중 흥미로운 개념은 바로 **ownership**(소유권)입니다.
러스트의 ownership은 다른 언어에서는 찾기 힘든 독특한 메모리 관리 방식으로, 러스트가 자랑하는 안전한 메모리 관리를 보장하는 메커니즘입니다.

러스트의 ownership에는 아래 세 가지 주요 규칙이 있습니다.

- 각각의 값마다 owner가 정해져 있고,
- 값은 반드시 하나의 owner만 가질 수 있으며,
- owner가 스코프(scope) 밖으로 벗어난다면 그 값은 drop 됩니다.

## 1.1 Owner

러스트에서 특정 값이 메모리에 할당되면 반드시 하나의 변수만이 그 값의 주인이 됩니다.
그리고 이 변수는 해당 값을 해제(drop)할 책임도 가지게 됩니다.
이러한 소유권 규칙으로 러스트는 가비지 컬렉터 없이도 안전하게 메모리를 관리할 수 있습니다.

예를 들어 아래와 같은 코드 살펴봅시다.

```rust
let s = String::from("hello");
```

"hello"라는 문자열은 힙(heap) 공간에 저장되고, 이 데이터를 가리키는 `String` 객체는 변수 `s`가 소유하게 됩니다.
이때 `s`는 "hello"의 owner가 됩니다.

해당 값을 다른 변수에 할당한다면, 기존 owner로부터 소유권이 넘어가게 됩니다.
아래 예시에서는 `s`의 소유권이 `s2`로 이동합니다.

```rust
let s = String::from("hello");
let s2 = s;         // 소유권이 s2로 이동
println!("{}", s);  // 에러 발생!
```

만일 `s`의 값을 `s2`에 그대로 복사한다면 두 변수가 같은 힙 데이터를 가리키게 되고, 같은 메모리를 두 번 해제하려고 시도할 수 있습니다.
이는 이중 해제(double free) 문제로 이어질 수 있으며, 메모리 안전성에 위험한 상황이 발생할 수 있습니다.
러스트는 이러한 문제를 방지하기 위해 `String`과 같은 타입에서는 변수 할당 시 아예 소유권을 이동하도록 강제하고 있습니다.

하지만 `String`과는 달리 `i32`, `bool`, `char` 같은 타입은 크기가 고정되어 있어 컴파일 타입에 크기를 알 수 있으므로 힙이 아닌 스택(stack)에 저장됩니다.
이러한 타입은 copy 트레잇이 자동으로 구현되어 있기 때문에 다른 변수에 할당하거나 함수 인자로 넘길 때 copy가 발생하고, 원래 변수도 그대로 사용할 수 있습니다.

```rust
let s = 123;
let s2 = s;                // s2로 copy
println!("{} {}", s, s2);  // 123 123 출력
```

## 1.2 Scope

러스트에서 **스코프(scope)**는 변수가 살아있는 유효 범위를 의미합니다.
간단히 말해, 중괄호 {}로 감싸진 코드 블록이 하나의 스코프입니다.

```rust
{
    let s = String::from("hello");
}
```

내부 블록 안에서 생성된 `s`는 "hello"의 owner입니다.
그리고 그 블록이 끝나면 러스트가 자동으로 메모리를 해제합니다.

`String`을 함수의 인자로 전달하는 경우에도 소유권이 함수로 이동하게 되는데, 이때 해당 함수의 스코프가 종료되는 순간 그 값도 함께 drop 됩니다.

```rust
fn main() {
    let s = String::from("hello");
    print_string(s);    // s의 소유권이 함수로 이동
    println!("{}", s);  // 에러 발생!
}

fn print_string(string: String) {
    println!("{}", string);
}  // 여기서 string은 스코프를 벗어나고 drop
```

함수에 인자로 넘겼던 값을 다시 사용하는 방법으로 아래와 같이 해결할 수 있습니다.

### 1.2.1 Borrowing

**Borrowing**은 값의 소유권은 넘기지 않고 스코프 내부에 참조만 넘기는 방법입니다.
참조된 값은 소유권이 이전되지 않았기 때문에 스코프가 종료되어도 메모리에서 해제되지 않습니다.

참조에는 두 가지 방식이 있습니다.
immutable borrowing은 읽기 전용으로 값을 넘기며 동시에 여러 개의 참조가 존재할 수 있습니다. 
반면 mutable borrowing은 값을 수정할 수 있으며 스코프 내에서 하나만 존재합니다.

변수와 함수 인자에 `&` 키워드를 붙여서 참조를 읽기 전용으로 참조할 수 있습니다.

```rust
fn main() {
    let s = String::from("hello");
    print_string(&s);   // s의 참조만 넘김
    println!("{}", s);  // 여전히 사용 가능
}

fn print_string(string: &String) {
    println!("{}", string);  // 단순히 읽기만 가능
}
```

값을 수정 가능한 형태로 참조하는 경우에는 `&mut` 키워드를 사용하여 mutable borrowing을 할 수 있습니다.

```rust
fn main() {
    let mut s = String::from("hello");
    print_string(&mut s);
    println!("{}", s);  // hello world 출력
}

fn print_string(string: &mut String) {
    string.push_str(" world!");
    println!("{}", string);  // hello world 출력
}
```

위에서 언급했듯이 스코프 내에서 하나의 mutable 참조만 허용합니다.
mutable 참조가 유효한 동안에는 해당 데이터에 대한 다른 mutable 또는 immutable 참조를 만들 수 없습니다. 
이러한 제약은 데이터 경쟁(data race)을 컴파일 타임에 방지하고, 프로그램의 메모리 안전성을 보장합니다.

### 1.2.2 Clone

값의 복제본을 생성해서 함수에 전달하는 방법도 있습니다.
이때 독립적인 객체가 생성되는데, 복제된 객체를 변경해도 원본에는 아무런 영향이 가지 않습니다.
또한 복제된 객체의 소유권을 넘기므로 원본은 여전히 유효합니다.

```rust
fn main() {
    let s = String::from("hello");
    print_string(s.clone());  // s의 복제본 넘김
    println!("{}", s);        // 여전히 사용 가능
}

fn print_string(string: String) {
    println!("{}", string)
}
```

다만 `clone()` 방식은 힙 데이터를 복제하기 때문에 비용이 큰 연산이 될 수 있습니다.
성능이 민감한 코드에서는 `&` 참조를 넘기는 방식이 메모리 복사 없이 값만 빌려 쓰는 형태라서 더 효율적입니다.

---

References
- [소유권이 뭔가요? - The Rust Programming Language](https://doc.rust-kr.org/ch04-01-what-is-ownership.html){:target="_blank"}
