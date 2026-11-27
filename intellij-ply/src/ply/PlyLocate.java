package ply;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Predicate;
/**
 * Where the Mycel CLI is, per platform, with no IDE dependency so the Windows rules are unit-tested on any OS
 * (test/ply/PlyLocateTests.java, plain JDK). Windows differs in three ways that each broke the old lookup:
 * the installed file is `mycel.exe` (or an npm/dev `mycel.cmd`), never an extensionless `mycel`; PATH is
 * `;`-separated and entries may be quoted; the per-user installer puts it in %LOCALAPPDATA%\Mycel\bin, which an
 * IDE started before the install does not have on its PATH yet.
 */
final class PlyLocate {
 final boolean windows;
 private final Map<String,String> env; private final String home; private final Predicate<String> isExecutable;
 PlyLocate(boolean windows,Map<String,String> env,String home,Predicate<String> isExecutable){this.windows=windows;this.env=env;this.home=home==null?"":home;this.isExecutable=isExecutable;}
 static PlyLocate host(){
  boolean w=System.getProperty("os.name","").toLowerCase(Locale.ROOT).startsWith("windows");
  return new PlyLocate(w,System.getenv(),System.getProperty("user.home",""),p->{File f=new File(p);return f.isFile()&&f.canExecute();});
 }
 /** Windows environment names are case-insensitive (`Path`, `PATH`). */
 String env(String name){
  String v=env.get(name); if(v!=null||!windows)return v;
  for(Map.Entry<String,String> e:env.entrySet())if(e.getKey().equalsIgnoreCase(name))return e.getValue();
  return null;
 }
 char sep(){return windows?'\\':'/';}
 String join(String dir,String name){
  if(dir.endsWith("/")||(windows&&dir.endsWith("\\")))return dir+name;
  return dir+sep()+name;
 }
 /** Parent directory by this platform's rules; null at a root (`C:\`, `\\server\share`, `/`). */
 String parent(String p){
  String s=p; while(s.length()>1&&(s.endsWith("/")||(windows&&s.endsWith("\\"))))s=s.substring(0,s.length()-1);
  int i=windows?Math.max(s.lastIndexOf('\\'),s.lastIndexOf('/')):s.lastIndexOf('/');
  if(i<0)return null;
  if(windows){
   if(s.matches("(?i)^[a-z]:[\\\\/]?$"))return null;                       // C:\
   if(s.matches("^[\\\\/]{2}[^\\\\/]+[\\\\/][^\\\\/]+$"))return null;     // \\server\share
   if(i==2&&s.charAt(1)==':')return s.substring(0,3);                       // C:\x -> C:\
  }
  if(i==0)return s.length()>1?s.substring(0,1):null;
  return s.substring(0,i);
 }
 /** File names a launcher may have. Windows: launchable PATHEXT entries in PATHEXT order (default .COM;.EXE;.BAT;.CMD). */
 List<String> names(String base){
  List<String> out=new ArrayList<>();
  if(!windows){out.add(base);return out;}
  String pe=env("PATHEXT"); if(pe==null||pe.isBlank())pe=".COM;.EXE;.BAT;.CMD";
  for(String ext:pe.split(";")){
   String e=ext.trim().toLowerCase(Locale.ROOT);
   if((e.equals(".exe")||e.equals(".com")||e.equals(".cmd")||e.equals(".bat"))&&!out.contains(base+e))out.add(base+e);
  }
  if(!out.contains(base+".exe"))out.add(base+".exe");
  return out;
 }
 List<String> pathDirs(String path){
  List<String> dirs=new ArrayList<>();
  if(windows){
   String lad=env("LOCALAPPDATA"); if(lad!=null&&!lad.isBlank())dirs.add(join(join(lad,"Mycel"),"bin"));
  }else{
   dirs.addAll(List.of("/opt/homebrew/bin","/usr/local/bin",home+"/.local/bin",home+"/.mycel/bin"));
  }
  if(path!=null)for(String d:path.split(windows?";":":")){
   String t=d.trim(); if(windows&&t.length()>=2&&t.startsWith("\"")&&t.endsWith("\""))t=t.substring(1,t.length()-1);
   if(!t.isEmpty()&&!dirs.contains(t))dirs.add(t);
  }
  return dirs;
 }
 /** An installed `mycel` (or the older `ply` name) in the usual install dirs or on PATH. */
 String onPath(String path){
  List<String> dirs=pathDirs(path);
  for(String n:new String[]{"mycel","ply"})for(String d:dirs)for(String f:names(n)){String c=join(d,f);if(isExecutable.test(c))return c;}
  return null;
 }
 /** lang/bin/mycel (or bin/mycel beside dist/) in a directory above `fromFile`: a repo checkout. */
 String inTree(String fromFile,Predicate<String> isDir){
  if(fromFile==null)return null;
  for(String d=parent(fromFile);d!=null;d=parent(d)){
   for(String n:new String[]{"mycel","ply"})for(String f:names(n)){
    String a=join(join(join(d,"lang"),"bin"),f); if(isExecutable.test(a))return a;
    String b=join(join(d,"bin"),f); if(isExecutable.test(b)&&isDir.test(join(d,"dist")))return b;
   }
  }
  return null;
 }
 /**
  * PATH for the child. macOS: a Dock-launched IDE lacks Homebrew and /usr/local, where `node` for the dev
  * shim lives. Windows: keep PATH as is (null = don't override): prefixing with `:` would fuse the first
  * `;`-separated entry with "/usr/local/bin" and drop it (typically C:\Windows\system32).
  */
 String childPath(){
  if(windows)return null;
  String path=env("PATH"); if(path==null)path="/usr/bin:/bin";
  return "/opt/homebrew/bin:/usr/local/bin:"+path;
 }
}
