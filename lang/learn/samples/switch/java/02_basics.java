// Classes, types, and methods in Java
public class Main {
  static class Counter {
    int value = 0;
    int bump() { return bump(1); }
    int bump(int step) {
      this.value += step;
      return this.value;
    }
  }

  static String label(int n) { return "count=" + n; }

  public static void main(String[] args) {
    Counter c = new Counter();
    System.out.println(c.bump() + " " + c.bump(2));
    System.out.println(label(c.value));
  }
}
