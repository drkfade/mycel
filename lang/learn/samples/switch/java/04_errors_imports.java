// Optional, checked exceptions, and manual parsing in Java
import java.util.*;

public class Main {
  static Optional<String> findUser(Map<String, String> users, String id) {
    return Optional.ofNullable(users.get(id));
  }

  static int parseAge(String raw) {
    int age = Integer.parseInt(raw);
    if (age < 0) throw new IllegalArgumentException("negative age");
    return age;
  }

  public static void main(String[] args) {
    Map<String, String> users = Map.of("u1", "Ada");
    System.out.println(findUser(users, "u1").orElse("guest"));
    System.out.println(findUser(users, "u9").orElse("guest"));
    System.out.println(parseAge("28"));
    try {
      System.out.println(parseAge("x"));
    } catch (NumberFormatException e) {
      System.out.println("bad age: x");
    }
  }
}
