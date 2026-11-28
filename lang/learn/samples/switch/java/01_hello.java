// Hello in Java
public class Main {
  public static void main(String[] args) {
    String name = "Ada";
    double exact = 7.0 / 2;
    int whole = Math.floorDiv(7, 2);
    int negDiv = Math.floorDiv(-7, 2);
    int negMod = Math.floorMod(-7, 3);
    System.out.printf("Hello, %s! sqrt(25)=%.1f%n", name, Math.sqrt(25.0));
    System.out.printf("exact=%.1f, whole=%d, negDiv=%d, negMod=%d%n", exact, whole, negDiv, negMod);
  }
}
