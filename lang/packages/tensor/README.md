# `tensor` — Tensors and Autograd for Mycel

Lists and tables of numbers that do maths fast, and a model that learns which way to nudge each number. A beginner-first, numpy-like package with reverse-mode autograd, so you can train a small transformer on your own laptop in plain Mycel.

The heavy maths (matmul, softmax, layer norm, the gradient pass) runs in host code on typed arrays. Your Mycel code only calls it.

## Install

```sh
ply install tensor
```

```mycel
import tensor
from tensor import Tensor
```

> Note: `import tensor.{Tensor}` still works but is deprecated; use `from tensor import Tensor` to name the type.

## Permissions

Maths needs **no permission**: the package declares `"capabilities": { "compute": true }`, which means "pure computation, no outside access". Only saving and loading weights touches files:

| Call | CLI flag | `ply.json` `"capabilities"` |
|---|---|---|
| `tensor.save(path, params)` | `--allow-write=<dir>` | `"fs": { "write": ["."] }` |
| `tensor.load(path, params)` | `--allow-read=<dir>` | `"fs": { "read": ["."] }` |

A denied call returns `Err(CapabilityError)` that names the flag to add.

## A first program

```mycel
import tensor

fn main() {
    let x = tensor.scalar(1.0).requireGrad()
    let y = (x * 3.0 + 2.0).pow(2.0)
    y.backward()
    print(f"y = {y.item()}  dy/dx = {x.grad.item()}")
}
```

prints `y = 25.0  dy/dx = 30.0` (by hand: `6 * (3x + 2)` at `x = 1`).

## The `Tensor`

A tensor is an n-dimensional table of 64-bit floats, stored row by row. `shape` is its size along each axis: `[]` is a single number, `[3]` a list of 3, `[2, 3]` a table of 2 rows and 3 columns.

Tensors are **never changed in place by maths**: `a + b` makes a new tensor. Only the optimizer, `load`, and `requireGrad()` change a tensor you already have.

### Making tensors

| Function | Result |
|---|---|
| `tensor.zeros(shape)`, `tensor.ones(shape)`, `tensor.full(shape, value)` | filled tensors |
| `tensor.arange(n)` | `[0.0, 1.0, ..., n-1]` |
| `tensor.scalar(x)` | a single number (shape `[]`) |
| `tensor.array([1.0, 2.0])` | a list (1-d) |
| `tensor.table([[1.0, 2.0], [3.0, 4.0]])` | a table (2-d) from rows |
| `tensor.fromList(values, shape)` | any shape from a flat list |
| `tensor.randn(shape)`, `tensor.randnStd(shape, std)` | normal random numbers (mean 0, standard deviation 1 or `std`) |
| `tensor.rand(shape)` | uniform random numbers in [0, 1) |
| `tensor.causalMask(n)` | `n x n` table: `0.0` on and below the diagonal, `-1e9` above. Add it to attention scores so a position cannot look ahead |

### Seeded random numbers

Mycel's `math.random()` cannot be seeded. These can, and the same seed gives the same numbers on every machine:

- `tensor.seed(n: Int)` restarts the generator.
- `tensor.random() -> Float` is a uniform number in [0, 1).
- `tensor.randn`, `tensor.rand`, `tensor.sample` all draw from the same generator.

Without a `seed` call a run starts from a random seed.

### Looking at a tensor

- `t.shape -> [Int]`, `t.ndim -> Int`, `t.size -> Int` (how many numbers)
- `t.item() -> Float` (a tensor of exactly one number)
- `t.toList() -> [Float]` (all numbers, row by row)
- `print(t)` / `t.toString()` shows it readably:

```
tensor([[1.0, 2.0],
        [3.0, 4.0]])
```

Large tensors show the first and last three entries of each axis with `...`. A tensor that is tracking gradients ends with `, requires_grad`.

### Changing shape, picking parts

- `t.reshape([3, -1])` new shape with the same numbers; one `-1` means "work this size out".
- `t.transpose()` swaps the last two axes (rows and columns).
- `t.permute([0, 2, 1, 3])` reorders axes (used to split attention into heads).
- `t.rows(start, end)` rows `start` to `end - 1` along axis 0.
- `t.indexSelect([4, 0, 4])` pick rows by number, repeats allowed. This is an embedding lookup.

### Maths

- Operators `+ - * /` with another tensor or a `Float` on the right, and unary `-`. Shapes **broadcast** like numpy: align from the right; two sizes fit when they are equal or one is 1. So a table `[3, 4]` plus a list `[4]` adds the list to every row.
  There is no `2.0 * t`; write `t * 2.0`.
- `a.matmul(b)`: `[m, k]` times `[k, n]` gives `[m, n]`. With more leading axes the batches multiply one by one (`[B, H, T, D]` times `[B, H, D, T]`), or the right side may be a plain table shared by every batch item. Two lists give a dot product.
- Reductions: `t.sum()`, `t.mean()`, `t.max()` of everything, or along an axis: `t.sum(axis)`, `t.sum(axis, true)` (`true` keeps the axis with size 1). Negative axes count from the end (`-1` is last). `t.argmax()` gives the flat index of the biggest number.
- Per-number functions: `exp`, `log`, `sqrt`, `tanh`, `sigmoid`, `relu`, `gelu` (the smooth "tanh" version), `pow(p)`.
- `t.softmax()`, `t.softmax(axis)`: positive numbers that add up to 1 along the axis (default last).
- `t.logSoftmax()`, `t.logSoftmax(axis)`.
- `logits.crossEntropy(targets: [Int])`: the average of `-log(probability of the right answer)`. `logits` is `[rows, classes]` (or any shape ending in classes) and `targets` has one class number per row. A single number comes back.
- `x.layerNorm(gamma, beta)`: normalises each row (last axis) to mean 0 and variance 1, then scales by `gamma` and shifts by `beta` (both lists of the row length).

### Learning: autograd

1. Mark the numbers a model should learn: `w = tensor.randn([3, 2]).requireGrad()`. (`requireGrad()` returns the same tensor.)
2. Do maths. Every result from a tracked tensor remembers how it was made.
3. Call `.backward()` on a **single number** (the loss). Every tracked tensor now has `.grad`, a tensor of the same shape: how much the loss changes if that number goes up by a tiny bit.
4. `.grad` **adds up** across `backward()` calls. Call `t.zeroGrad()` (or `opt.zeroGrad()`) before each new step.

`t.grad` is all zeros until `backward()` has run. `t.detach()` gives a copy that does not track anything. `t.requiresGrad` tells you whether it does.

### Optimizers

```mycel
let opt = tensor.adam(params, 0.01)      // params: [Tensor], each marked with requireGrad()
opt.zeroGrad()
loss.backward()
opt.step()
```

- `tensor.sgd(params, lr)`, `tensor.sgdMomentum(params, lr, momentum)`: `w = w - lr * grad`.
- `tensor.adam(params, lr)`: Adam with beta1 0.9, beta2 0.999, epsilon 1e-8.
- `opt.step()`, `opt.zeroGrad()`, `opt.setLr(lr)` (to change the learning rate while training).
- `tensor.clipGradNorm(params, maxNorm) -> Float` shrinks all gradients if their combined length is over `maxNorm`, and returns the length it measured.

### Sampling

- `tensor.sample(probs: Tensor) -> Int` picks an index with chance proportional to the numbers (they need not add up to 1, but none may be negative).
- `tensor.sampleList(probs: [Float]) -> Int` the same for a plain list.

For temperature, divide the logits before `softmax()`: `(logits / 0.8).softmax()`.

### Saving and loading weights

```mycel
tensor.save("weights.bin", params).unwrap()    // needs --allow-write
tensor.load("weights.bin", params).unwrap()    // needs --allow-read
```

`load` writes into the tensors you pass, so build the model first and load into the same list in the same order. It checks the count and every shape and says which one differs. Values are stored as 64-bit floats, so a reload is exact.

## Errors a beginner can read

Mistakes stop the program with a message in plain words that names both shapes:

```
panic: Cannot add these two tensors: the left side is a table of 2 rows and 2 columns and the right side is a list of 3 numbers. Shapes [2, 2] and [3] do not line up: the sizes 2 and 3 differ at position -1 (counting from the end). Two sizes fit when they are equal or one of them is 1.
```

```
panic: Cannot matmul: the left side is a table of 2 rows and 3 columns and the right side is a table of 2 rows and 5 columns. To multiply, the number of columns on the left (3) must equal the number of rows on the right (2). Tip: a.transpose() swaps rows and columns.
```

```
panic: Cannot reshape a table of 2 rows and 3 columns (6 numbers) into a table of 4 rows and 2 columns (8 numbers). Both must hold the same count of numbers.
```

`save` and `load` return `Result` (the file may not exist), everything else panics.

## Speed

`matmul` is a cache-friendly row-by-row loop on `Float64Array`, unrolled by four. On an Apple M1, a 256 x 256 times 256 x 256 matmul takes about 9.4 ms at best (3.6 GFLOPS), measured by `node lang/packages/tensor/bench/matmul.cjs 256`.

## Example: a tiny GPT

`lang/examples/tensor/tiny_gpt/` trains a character-level transformer (token and position embeddings, 2 blocks of masked 4-head attention + MLP + layer norm + residuals) on 1,000 made-up names and generates new ones. Run it from that folder with:

```sh
mycel run --allow-read=.
```

## Tests

- `node --test dist/tests/tensor.test.js` (from `lang/`, after `npm run build`): numeric gradient checks for every op with autograd, hand-maths checks, optimizers, RNG, save/load, error messages, and the Mycel-level tests in `tests/tensor_pkg_test.myc`.
