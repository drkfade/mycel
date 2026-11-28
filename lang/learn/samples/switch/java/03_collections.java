// Lists, Maps, Streams, and regex extraction in Java
import java.util.*;
import java.util.regex.*;
import java.util.stream.*;

public class Main {
  public static void main(String[] args) {
    List<Integer> nums = List.of(2, 6, 3, 9, 4, 8);
    List<Integer> big = nums.stream().filter(x -> x > 5).toList();
    List<Integer> doubled = big.stream().map(x -> x * 2).toList();
    int total = big.stream().reduce(0, Integer::sum);
    System.out.printf("big=%s, doubled=%s, total=%d%n", big, doubled, total);

    Map<String, Integer> ages = new LinkedHashMap<>();
    ages.put("ana", 31);
    ages.put("bo", 25);
    for (var e : ages.entrySet()) {
      System.out.println(e.getKey() + ": " + e.getValue());
    }
    System.out.println(ages.getOrDefault("zoe", 0) + " " + ages.containsKey("ana"));

    Matcher m = Pattern.compile("\\d+").matcher("GET /api 12ms, POST /pay 84ms, ping 3ms");
    List<Integer> ms = new ArrayList<>();
    while (m.find()) {
      int v = Integer.parseInt(m.group());
      if (v > 5) ms.add(v);
    }
    System.out.println(ms);
  }
}
