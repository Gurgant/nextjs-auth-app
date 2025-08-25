# Collapsible Section Test

## Basic Test

<details>
<summary>Click to expand basic content</summary>

This is basic content that should be collapsible.

</details>

## Code Block Test

<details>
<summary>Click to expand code block</summary>

```typescript
// This is a test code block
export function test() {
  console.log("Hello World");
  return true;
}
```

</details>

## Complex Test

<details>
<summary><strong>🚀 View Complete Test Implementation</strong> (15 lines - Click to expand)</summary>

```typescript
// Test implementation with proper spacing
export class TestBuilder {
  private data: any = {};

  withValue(value: string): TestBuilder {
    this.data.value = value;
    return this;
  }

  build(): any {
    return this.data;
  }
}
```

</details>

## Inline HTML Test

<details>
<summary><b>HTML formatted summary</b></summary>

<p>This content uses HTML formatting inside the details.</p>

<pre><code>
const test = "This is code in HTML format";
console.log(test);
</code></pre>

</details>
