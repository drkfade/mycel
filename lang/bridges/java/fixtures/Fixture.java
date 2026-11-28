import java.util.*;
import java.util.function.Function;
public class Fixture {
 public interface Listener { void changed(String value); }
 public static String text="initial";
 public static String overload(String x){return "string";}
 public static String overload(Object x){return "object";}
 public static String join(String... x){return String.join("/",x);}
 public static Object echo(Object x){return x;}
 public static byte[] bytes(byte[] x){return x;}
 public static String apply(Function<String,String> f){return f.apply("hello");}
 public static void listen(Listener l){l.changed("event");}
 public static void fail(){throw new IllegalStateException("fixture failure");}
}
