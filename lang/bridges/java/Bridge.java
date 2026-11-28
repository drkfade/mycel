import java.io.*;
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
import javax.swing.*;
import java.awt.Component;
import java.awt.EventQueue;

/** JSON-lines Java bridge. Only the protocol is written to stdout. */
public class Bridge {
  static final BufferedReader in = new BufferedReader(new InputStreamReader(System.in, java.nio.charset.StandardCharsets.UTF_8));
  static final PrintWriter out = new PrintWriter(new OutputStreamWriter(System.out, java.nio.charset.StandardCharsets.UTF_8), true);
  static final Map<Long,Object> handles = new HashMap<>(); static long next = 1;
  static synchronized void send(Object v) { out.println(Json.write(v)); }
  static Map<String,Object> map(Object x) { return (Map<String,Object>) x; }
  static Object handle(Object x) { long id=next++; handles.put(id,x); return Map.of("$h",id,"type",x instanceof Class<?> c ? c.getName() : x.getClass().getName()); }
  static Object encode(Object x) {
    if(x==null || x instanceof String || x instanceof Boolean) return x;
    if(x instanceof Character) return x.toString();
    if(x instanceof Byte || x instanceof Short || x instanceof Integer || x instanceof Long || x instanceof BigInteger) {
      BigInteger n=new BigInteger(x.toString()); return n.abs().compareTo(BigInteger.valueOf(9007199254740991L))>0 ? Map.of("$int",n.toString()) : n;
    }
    if(x instanceof Number) return x;
    if(x instanceof byte[] b) return Map.of("$bytes",Base64.getEncoder().encodeToString(b));
    if(x.getClass().isArray()) { List<Object> a=new ArrayList<>(); for(int i=0;i<Array.getLength(x);i++) a.add(encode(Array.get(x,i))); return a; }
    if(x instanceof List<?> l) { List<Object> a=new ArrayList<>(); for(Object v:l) a.add(encode(v)); return a; }
    if(x instanceof Map<?,?> m && m.keySet().stream().allMatch(k -> k instanceof String)) { Map<String,Object> a=new LinkedHashMap<>(); m.forEach((k,v)->a.put((String)k,encode(v))); return a; }
    return handle(x);
  }
  static Object decode(Object x) {
    if(x instanceof Map<?,?>) { Map<String,Object> m=map(x); if(m.containsKey("$h")) { long id=((Number)m.get("$h")).longValue(); if(!handles.containsKey(id)) throw new IllegalArgumentException("Unknown or released handle "+id); return handles.get(id); } if(m.containsKey("$int")) return new BigInteger((String)m.get("$int")); if(m.containsKey("$bytes")) return Base64.getDecoder().decode((String)m.get("$bytes")); if(m.containsKey("$callback")) return new Callback(((Number)m.get("$callback")).longValue()); Map<String,Object> r=new LinkedHashMap<>(); m.forEach((k,v)->r.put(k,decode(v))); return r; }
    if(x instanceof List<?> l) { List<Object> r=new ArrayList<>(); for(Object v:l) r.add(decode(v)); return r; } return x;
  }
  record Callback(long id) {}
  static boolean callbackInterface(Class<?> c) { return c.isInterface() && Arrays.stream(c.getMethods()).anyMatch(m -> Modifier.isAbstract(m.getModifiers()) && m.getDeclaringClass()!=Object.class); }
  static int cost(Object v, Class<?> t) {
    if(v==null) return t.isPrimitive()?10000:10;
    if(v instanceof Callback) return callbackInterface(t)?3:10000;
    if(t.isPrimitive()) t=box(t);
    if(t==v.getClass()) return 0;
    if(t.isInstance(v)) return t==Object.class?8:2;
    if(v instanceof Number n && Number.class.isAssignableFrom(t)) { double d=n.doubleValue(); if(t==Byte.class && (d<Byte.MIN_VALUE||d>Byte.MAX_VALUE||d!=Math.rint(d))) return 10000; if(t==Short.class && (d<Short.MIN_VALUE||d>Short.MAX_VALUE||d!=Math.rint(d))) return 10000; if(t==Integer.class && (d<Integer.MIN_VALUE||d>Integer.MAX_VALUE||d!=Math.rint(d))) return 10000; if(t==Long.class && (d<Long.MIN_VALUE||d>Long.MAX_VALUE||d!=Math.rint(d))) return 10000; return t==Long.class?1:t==Integer.class?2:4; }
    if(t==Character.class && v instanceof String s && s.length()==1) return 4;
    if(t.isArray() && v instanceof List<?>) return 4;
    return 10000;
  }
  static Class<?> box(Class<?> c) { if(c==int.class)return Integer.class;if(c==long.class)return Long.class;if(c==double.class)return Double.class;if(c==float.class)return Float.class;if(c==short.class)return Short.class;if(c==byte.class)return Byte.class;if(c==boolean.class)return Boolean.class;if(c==char.class)return Character.class;return c; }
  static Object convert(Object v, Class<?> t) {
    if(v instanceof Callback cb && callbackInterface(t)) return Proxy.newProxyInstance(t.getClassLoader(),new Class<?>[]{t},(p,m,a)->{
      if(m.getDeclaringClass()==Object.class) return switch(m.getName()){case "toString" -> "Mycel callback "+cb.id; case "hashCode" -> System.identityHashCode(p); case "equals" -> p==a[0]; default -> null;};
      List<Object> args=new ArrayList<>(); if(a!=null) for(Object z:a) args.add(encode(z));
      synchronized(in) { send(Map.of("callback",cb.id,"args",args)); String line=in.readLine(); if(line==null) throw new IOException("callback channel closed"); Map<String,Object> reply=map(Json.read(line)); if(Boolean.FALSE.equals(reply.get("ok"))) throw new RuntimeException(String.valueOf(reply.get("error"))); return convert(decode(reply.get("value")),m.getReturnType()); }
    });
    if(v==null)return null; if(t.isPrimitive())t=box(t);
    if(v instanceof Number n) { if(t==Integer.class)return n.intValue();if(t==Long.class)return n.longValue();if(t==Short.class)return n.shortValue();if(t==Byte.class)return n.byteValue();if(t==Double.class)return n.doubleValue();if(t==Float.class)return n.floatValue(); }
    if(t==Character.class && v instanceof String s)return s.charAt(0);
    if(t.isArray() && v instanceof List<?> l) { Object a=Array.newInstance(t.getComponentType(),l.size());for(int i=0;i<l.size();i++)Array.set(a,i,convert(l.get(i),t.getComponentType()));return a; }
    return v;
  }
  record Choice(Executable executable,int score) {}
  static Choice choose(Collection<? extends Executable> choices,List<Object> args) throws Exception {
    List<Choice> good=new ArrayList<>(); for(Executable e:choices) { Class<?>[] p=e.getParameterTypes(); boolean va=e.isVarArgs(); if((!va && p.length!=args.size()) || (va && args.size()<p.length-1))continue; int s=va?20:0; for(int i=0;i<args.size();i++) s+=cost(args.get(i),va && i>=p.length-1?p[p.length-1].getComponentType():p[i]); if(s<10000)good.add(new Choice(e,s)); }
    if(good.isEmpty()) throw new NoSuchMethodException("No matching overload; candidates: "+choices);
    int best=good.stream().mapToInt(Choice::score).min().getAsInt(); List<Choice> tied=good.stream().filter(c->c.score==best).toList();
    if(tied.size()>1) { List<Choice> most=tied.stream().filter(a->tied.stream().allMatch(b->a==b || moreSpecific(a.executable,b.executable))).toList(); if(most.size()==1)return most.get(0); throw new IllegalArgumentException("Ambiguous overload; candidates: "+tied.stream().map(c->c.executable.toString()).toList()); }
    return tied.get(0);
  }
  static boolean moreSpecific(Executable a,Executable b) { Class<?>[] x=a.getParameterTypes(),y=b.getParameterTypes();if(x.length!=y.length)return false;boolean strict=false;for(int i=0;i<x.length;i++){Class<?> xx=box(x[i]),yy=box(y[i]);if(!yy.isAssignableFrom(xx))return false;if(xx!=yy)strict=true;}return strict; }
  static Object[] arguments(Executable e,List<Object> a) { Class<?>[] p=e.getParameterTypes();Object[] out=new Object[p.length];int n=e.isVarArgs()?p.length-1:p.length;for(int i=0;i<n;i++)out[i]=convert(a.get(i),p[i]);if(e.isVarArgs()){Class<?> t=p[n].getComponentType();Object v=Array.newInstance(t,a.size()-n);for(int i=n;i<a.size();i++)Array.set(v,i-n,convert(a.get(i),t));out[n]=v;}return out; }
  interface Work { Object run() throws Exception; }
  static Object edt(Object target,Work work) throws Exception { if(!(target instanceof Component) || EventQueue.isDispatchThread())return work.run(); Object[] result=new Object[1];Exception[] error=new Exception[1];SwingUtilities.invokeAndWait(()->{try{result[0]=work.run();}catch(Exception e){error[0]=e;}});if(error[0]!=null)throw error[0];return result[0]; }
  static Object execute(Map<String,Object> r) throws Exception {
    String op=(String)r.get("op"); if(op.equals("import")) return handle(Class.forName((String)r.get("module")));
    if(op.equals("release")){for(Object id:(List<?>)r.get("handles"))handles.remove(((Number)id).longValue());return null;}
    Object target=decode(r.get("target")); if(target==null)throw new IllegalArgumentException("Missing target");Class<?> c=target instanceof Class<?> cl?cl:target.getClass();boolean stat=target instanceof Class<?>;
    String name=(String)r.get("name"); List<Object> args=new ArrayList<>();for(Object v:(List<?>)r.getOrDefault("args",List.of()))args.add(decode(v));
    if(r.containsKey("kwargs") && !map(r.get("kwargs")).isEmpty())throw new IllegalArgumentException("Java does not accept named arguments");
    if(op.equals("get")||op.equals("set")) { try {Field f=c.getField(name);if(Modifier.isStatic(f.getModifiers())!=stat)throw new NoSuchFieldException(name);return edt(target,()->{if(op.equals("set")){f.set(stat?null:target,convert(decode(r.get("value")),f.getType()));return null;}return encode(f.get(stat?null:target));});} catch(NoSuchFieldException e){ List<String> members=new ArrayList<>();for(Method m:c.getMethods())if(Modifier.isStatic(m.getModifiers())==stat)members.add(m.getName());for(Field f:c.getFields())if(Modifier.isStatic(f.getModifiers())==stat)members.add(f.getName());throw new NoSuchFieldException(name+"; members: "+new TreeSet<>(members));} }
    if(op.equals("new")){Choice pick=choose(Arrays.asList(c.getConstructors()),args);Work construct=()->handle(((Constructor<?>)pick.executable).newInstance(arguments(pick.executable,args))); if(Component.class.isAssignableFrom(c) && !EventQueue.isDispatchThread()){ Object[] result=new Object[1]; Exception[] error=new Exception[1]; SwingUtilities.invokeAndWait(()->{try{result[0]=construct.run();}catch(Exception e){error[0]=e;}}); if(error[0]!=null)throw error[0]; return result[0]; } return construct.run();}
    if(op.equals("call")){List<Method> methods=Arrays.stream(c.getMethods()).filter(m->m.getName().equals(name)&&Modifier.isStatic(m.getModifiers())==stat&&!m.isBridge()).toList();if(methods.isEmpty())throw new NoSuchMethodException(c.getName()+"."+name+"; members: "+Arrays.toString(c.getMethods()));Choice pick=choose(methods,args);return edt(target,()->encode(((Method)pick.executable).invoke(stat?null:target,arguments(pick.executable,args))));}
    if(op.equals("iter")){Iterator<?> it=target instanceof Iterator<?> i?i:target instanceof Iterable<?> a?a.iterator():null;if(it==null)throw new IllegalArgumentException("Not iterable");int max=((Number)r.getOrDefault("max",100)).intValue();if(max<0||max>100000)throw new IllegalArgumentException("invalid iter max");List<Object> a=new ArrayList<>();while(a.size()<max&&it.hasNext())a.add(encode(it.next()));return a;}
    throw new IllegalArgumentException("Unknown operation "+op);
  }
  public static void main(String[] a) throws Exception { String line;while((line=in.readLine())!=null){Object id=null;try{Map<String,Object> r=map(Json.read(line));id=r.get("id");Object value=execute(r);Map<String,Object> reply=new LinkedHashMap<>();reply.put("id",id);reply.put("ok",true);reply.put("value",value);send(reply);}catch(Throwable t){while(t instanceof InvocationTargetException && t.getCause()!=null)t=t.getCause();StackTraceElement[] trace=t.getStackTrace();Map<String,Object> e=new LinkedHashMap<>();e.put("type",t.getClass().getName());e.put("message",String.valueOf(t.getMessage()));e.put("trace",trace.length==0?"":trace[0].toString());Map<String,Object> reply=new LinkedHashMap<>();reply.put("id",id);reply.put("ok",false);reply.put("error",e);send(reply);}} }
  static class Json {
    final String s;int i;Json(String s){this.s=s;} static Object read(String s){Json p=new Json(s);Object v=p.value();p.ws();if(p.i!=s.length())throw new IllegalArgumentException("trailing JSON");return v;}void ws(){while(i<s.length()&&Character.isWhitespace(s.charAt(i)))i++;}
    Object value(){ws();char c=s.charAt(i);if(c=='"')return str();if(c=='{'){i++;Map<String,Object> m=new LinkedHashMap<>();ws();if(s.charAt(i)=='}'){i++;return m;}while(true){ws();String k=str();ws();if(s.charAt(i++)!=':')throw new IllegalArgumentException("JSON colon");m.put(k,value());ws();char z=s.charAt(i++);if(z=='}')return m;if(z!=',')throw new IllegalArgumentException("JSON object");}}if(c=='['){i++;List<Object> l=new ArrayList<>();ws();if(s.charAt(i)==']'){i++;return l;}while(true){l.add(value());ws();char z=s.charAt(i++);if(z==']')return l;if(z!=',')throw new IllegalArgumentException("JSON array");}}if(s.startsWith("true",i)){i+=4;return true;}if(s.startsWith("false",i)){i+=5;return false;}if(s.startsWith("null",i)){i+=4;return null;}int start=i;while(i<s.length()&&"-+0123456789.eE".indexOf(s.charAt(i))>=0)i++;String n=s.substring(start,i);if(n.contains(".")||n.contains("e")||n.contains("E"))return Double.valueOf(n);return Long.valueOf(n);}
    String str(){if(s.charAt(i++)!='"')throw new IllegalArgumentException("JSON string");StringBuilder b=new StringBuilder();while(i<s.length()){char c=s.charAt(i++);if(c=='"')return b.toString();if(c=='\\'){c=s.charAt(i++);switch(c){case '"':case '\\':case '/':b.append(c);break;case 'b':b.append('\b');break;case 'f':b.append('\f');break;case 'n':b.append('\n');break;case 'r':b.append('\r');break;case 't':b.append('\t');break;case 'u':b.append((char)Integer.parseInt(s.substring(i,i+4),16));i+=4;break;default:throw new IllegalArgumentException("JSON escape");}}else b.append(c);}throw new IllegalArgumentException("unterminated JSON string");}
    static String write(Object x){if(x==null)return "null";if(x instanceof String s){StringBuilder b=new StringBuilder("\"");for(char c:s.toCharArray()){switch(c){case '"'->b.append("\\\"");case '\\'->b.append("\\\\");case '\n'->b.append("\\n");case '\r'->b.append("\\r");case '\t'->b.append("\\t");default->{if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}}}return b.append('"').toString();}if(x instanceof Boolean||x instanceof Number)return x.toString();if(x instanceof Map<?,?> m){List<String> a=new ArrayList<>();m.forEach((k,v)->a.add(write(k)+":"+write(v)));return "{"+String.join(",",a)+"}";}if(x instanceof Iterable<?> l){List<String>a=new ArrayList<>();l.forEach(v->a.add(write(v)));return "["+String.join(",",a)+"]";}throw new IllegalArgumentException("not JSON: "+x);}
  }
}
