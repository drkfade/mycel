# prelude

## print

```ply
extern fn print(value: Any)
```

## write

```ply
extern fn write(value: Any)
```

## panic

```ply
extern fn panic(message: String) -> Never
```

## assert

```ply
extern fn assert(condition: Bool, message: String = "assertion failed")
```

## str

```ply
extern fn str(value: Any) -> String
```

## repr

```ply
extern fn repr(value: Any) -> String
```

## len

```ply
extern fn len(value: Any) -> Int
```

## typeName

```ply
extern fn typeName(value: Any) -> String
```

## Printable

```ply
interface Printable
```

#### toString

```ply
fn toString() -> String
```

## Equatable

```ply
interface Equatable
```

## Hashable

```ply
interface Hashable
```

## Comparable

```ply
interface Comparable
```

## Numeric

```ply
interface Numeric
```

## Iterator

```ply
interface Iterator<T>
```

#### next

```ply
fn next() -> T?
```

## Iterable

```ply
interface Iterable<T>
```

#### iter

```ply
fn iter() -> Iterator<T>
```

## Int

```ply
extern class Int: Comparable, Equatable, Hashable, Numeric, Printable
```

#### get abs

```ply
get abs: Int
```

#### get isEven

```ply
get isEven: Bool
```

#### get isOdd

```ply
get isOdd: Bool
```

#### get sign

```ply
get sign: Int
```

#### toFloat

```ply
fn toFloat() -> Float
```

#### toString

```ply
fn toString() -> String
```

#### toChar

```ply
fn toChar() -> Char
```

#### pow

```ply
fn pow(exp: Int) -> Int
```

#### min

```ply
fn min(other: Int) -> Int
```

#### max

```ply
fn max(other: Int) -> Int
```

#### clamp

```ply
fn clamp(lo: Int, hi: Int) -> Int
```

#### toRadix

```ply
fn toRadix(radix: Int) -> String
```

#### parse

```ply
static fn parse(text: String) -> Int?
```

#### get maxValue

```ply
static get maxValue: Int
```

#### get minValue

```ply
static get minValue: Int
```

## Float

```ply
extern class Float: Comparable, Equatable, Hashable, Numeric, Printable
```

#### get abs

```ply
get abs: Float
```

#### get isNaN

```ply
get isNaN: Bool
```

#### get isFinite

```ply
get isFinite: Bool
```

#### floor

```ply
fn floor() -> Int
```

#### ceil

```ply
fn ceil() -> Int
```

#### round

```ply
fn round() -> Int
```

#### trunc

```ply
fn trunc() -> Int
```

#### toInt

```ply
fn toInt() -> Int
```

#### toString

```ply
fn toString() -> String
```

#### sqrt

```ply
fn sqrt() -> Float
```

#### pow

```ply
fn pow(exp: Float) -> Float
```

#### min

```ply
fn min(other: Float) -> Float
```

#### max

```ply
fn max(other: Float) -> Float
```

#### clamp

```ply
fn clamp(lo: Float, hi: Float) -> Float
```

#### fixed

```ply
fn fixed(digits: Int) -> String
```

#### parse

```ply
static fn parse(text: String) -> Float?
```

#### get infinity

```ply
static get infinity: Float
```

#### get nan

```ply
static get nan: Float
```

## Bool

```ply
extern class Bool: Equatable, Hashable, Printable
```

#### toString

```ply
fn toString() -> String
```

## Char

```ply
extern class Char: Comparable, Equatable, Hashable, Printable
```

#### get isDigit

```ply
get isDigit: Bool
```

#### get isLetter

```ply
get isLetter: Bool
```

#### get isUpper

```ply
get isUpper: Bool
```

#### get isLower

```ply
get isLower: Bool
```

#### get isWhitespace

```ply
get isWhitespace: Bool
```

#### get code

```ply
get code: Int
```

#### upper

```ply
fn upper() -> Char
```

#### lower

```ply
fn lower() -> Char
```

#### toString

```ply
fn toString() -> String
```

#### fromCode

```ply
static fn fromCode(code: Int) -> Char
```

## String

```ply
extern class String: Comparable, Equatable, Hashable, Printable, Iterable<Char>
```

#### get length

```ply
get length: Int
```

#### get isEmpty

```ply
get isEmpty: Bool
```

#### upper

```ply
fn upper() -> String
```

#### lower

```ply
fn lower() -> String
```

#### trim

```ply
fn trim() -> String
```

#### trimStart

```ply
fn trimStart() -> String
```

#### trimEnd

```ply
fn trimEnd() -> String
```

#### split

```ply
fn split(sep: String) -> [String]
```

#### lines

```ply
fn lines() -> [String]
```

#### chars

```ply
fn chars() -> [Char]
```

#### contains

```ply
fn contains(part: String) -> Bool
```

#### startsWith

```ply
fn startsWith(prefix: String) -> Bool
```

#### endsWith

```ply
fn endsWith(suffix: String) -> Bool
```

#### replace

```ply
fn replace(find: String, with: String) -> String
```

#### indexOf

```ply
fn indexOf(part: String) -> Int?
```

#### repeat

```ply
fn repeat(n: Int) -> String
```

#### padLeft

```ply
fn padLeft(width: Int, fill: String = " ") -> String
```

#### padRight

```ply
fn padRight(width: Int, fill: String = " ") -> String
```

#### reversed

```ply
fn reversed() -> String
```

#### toInt

```ply
fn toInt() -> Int?
```

#### toFloat

```ply
fn toFloat() -> Float?
```

#### toString

```ply
fn toString() -> String
```

#### substring

```ply
fn substring(from: Int, to: Int) -> String
```

#### iter

```ply
fn iter() -> Iterator<Char>
```

#### bytes

```ply
fn bytes() -> [Int]
```

## Array

```ply
extern class Array<T>: Iterable<T>
```

#### init

```ply
init()
```

#### get length

```ply
get length: Int
```

#### get isEmpty

```ply
get isEmpty: Bool
```

#### get first

```ply
get first: T?
```

#### get last

```ply
get last: T?
```

#### at

```ply
fn at(index: Int) -> T?
```

The element at index, or nil when out of range (indexing with [i] panics instead).

#### push

```ply
fn push(item: T)
```

#### pop

```ply
fn pop() -> T?
```

#### insert

```ply
fn insert(item: T, at: Int)
```

#### removeAt

```ply
fn removeAt(index: Int) -> T
```

#### clear

```ply
fn clear()
```

#### append

```ply
fn append(items: [T])
```

#### map

```ply
fn map<U>(f: (T) -> U) -> [U]
```

#### flatMap

```ply
fn flatMap<U>(f: (T) -> [U]) -> [U]
```

#### filter

```ply
fn filter(f: (T) -> Bool) -> [T]
```

#### reduce

```ply
fn reduce<U>(initial: U, f: (U, T) -> U) -> U
```

#### forEach

```ply
fn forEach(f: (T) -> Void)
```

#### any

```ply
fn any(f: (T) -> Bool) -> Bool
```

#### all

```ply
fn all(f: (T) -> Bool) -> Bool
```

#### find

```ply
fn find(f: (T) -> Bool) -> T?
```

#### findIndex

```ply
fn findIndex(f: (T) -> Bool) -> Int?
```

#### count

```ply
fn count(f: (T) -> Bool) -> Int
```

#### contains

```ply
fn contains(item: T) -> Bool
```

#### indexOf

```ply
fn indexOf(item: T) -> Int?
```

#### sorted

```ply
fn sorted() -> [T]
```

#### sortedBy

```ply
fn sortedBy<K>(key: (T) -> K) -> [T]
```

#### reversed

```ply
fn reversed() -> [T]
```

#### join

```ply
fn join(sep: String = "") -> String
```

#### slice

```ply
fn slice(from: Int, to: Int) -> [T]
```

#### take

```ply
fn take(n: Int) -> [T]
```

#### drop

```ply
fn drop(n: Int) -> [T]
```

#### concat

```ply
fn concat(other: [T]) -> [T]
```

#### enumerate

```ply
fn enumerate() -> [(Int, T)]
```

#### zip

```ply
fn zip<U>(other: [U]) -> [(T, U)]
```

#### unique

```ply
fn unique() -> [T]
```

#### copy

```ply
fn copy() -> [T]
```

#### iter

```ply
fn iter() -> Iterator<T>
```

## Map

```ply
extern class Map<K, V>: Iterable<(K, V)>
```

#### init

```ply
init()
```

#### get length

```ply
get length: Int
```

#### get isEmpty

```ply
get isEmpty: Bool
```

#### get keys

```ply
get keys: [K]
```

#### get values

```ply
get values: [V]
```

#### get entries

```ply
get entries: [(K, V)]
```

#### has

```ply
fn has(key: K) -> Bool
```

#### get

```ply
fn get(key: K) -> V?
```

#### getOr

```ply
fn getOr(key: K, default: V) -> V
```

#### set

```ply
fn set(key: K, value: V)
```

#### remove

```ply
fn remove(key: K) -> V?
```

#### clear

```ply
fn clear()
```

#### copy

```ply
fn copy() ->
```

#### merge

```ply
fn merge(other: {K: V}) ->
```

#### iter

```ply
fn iter() -> Iterator<(K, V)>
```

## Set

```ply
extern class Set<T>: Iterable<T>
```

#### init

```ply
init()
```

#### get length

```ply
get length: Int
```

#### get isEmpty

```ply
get isEmpty: Bool
```

#### add

```ply
fn add(item: T)
```

#### has

```ply
fn has(item: T) -> Bool
```

#### remove

```ply
fn remove(item: T) -> Bool
```

#### clear

```ply
fn clear()
```

#### union

```ply
fn union(other: Set<T>) -> Set<T>
```

#### intersect

```ply
fn intersect(other: Set<T>) -> Set<T>
```

#### subtract

```ply
fn subtract(other: Set<T>) -> Set<T>
```

#### toArray

```ply
fn toArray() -> [T]
```

#### iter

```ply
fn iter() -> Iterator<T>
```

## Range

```ply
extern class Range: Iterable<Int>
```

#### get lo

```ply
get lo: Int
```

#### get hi

```ply
get hi: Int
```

#### get length

```ply
get length: Int
```

#### contains

```ply
fn contains(n: Int) -> Bool
```

#### toArray

```ply
fn toArray() -> [Int]
```

#### iter

```ply
fn iter() -> Iterator<Int>
```

## Gen

```ply
extern class Gen<T>: Iterator<T>, Iterable<T>
```

#### next

```ply
fn next() -> T?
```

#### toArray

```ply
fn toArray() -> [T]
```

#### iter

```ply
fn iter() -> Iterator<T>
```

## Task

```ply
extern class Task<T>
```

## Error

```ply
class Error: Printable
```

#### init

```ply
init(message: String)
```

#### toString

```ply
fn toString() -> String
```

## IoError

```ply
class IoError: Error
```

## ParseError

```ply
class ParseError: Error
```

## CapabilityError

```ply
class CapabilityError: Error
```

## NetError

```ply
class NetError: Error
```

## SqlError

```ply
class SqlError: Error
```

## TimeoutError

```ply
class TimeoutError: Error
```

## Result

```ply
enum Result { Ok(T), Err(E) }
```

#### get isOk

```ply
get isOk: Bool
```

#### get isErr

```ply
get isErr: Bool
```

#### unwrap

```ply
fn unwrap() -> T
```

#### unwrapOr

```ply
fn unwrapOr(fallback: T) -> T
```

#### ok

```ply
fn ok() -> T?
```

#### err

```ply
fn err() -> E?
```

#### map

```ply
fn map<U>(f: (T) -> U) -> Result<U, E>
```

#### mapErr

```ply
fn mapErr<F>(f: (E) -> F) -> Result<T, F>
```

#### andThen

```ply
fn andThen<U>(f: (T) -> Result<U, E>) -> Result<U, E>
```
