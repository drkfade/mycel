package ply;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
/** Windows/macOS executable lookup with an injected platform and file set. Plain JDK, no IDE jars: scripts/test-locate.sh */
public final class PlyLocateTests {
 static int fails=0,count=0;
 static void eq(String name,Object want,Object got){count++;if(want==null?got!=null:!want.equals(got)){fails++;System.out.println("FAIL "+name+"\n  want: "+want+"\n  got:  "+got);}}
 static PlyLocate win(Map<String,String> env,Set<String> files){return new PlyLocate(true,env,"C:\\Users\\Ana",files::contains);}
 public static void main(String[] a){
  Map<String,String> env=new HashMap<>();
  env.put("Path","C:\\Windows\\system32;\"C:\\Program Files\\nodejs\";C:\\Users\\Ana\\AppData\\Roaming\\npm");
  env.put("LOCALAPPDATA","C:\\Users\\Ana\\AppData\\Local");
  // the installer's per-user dir is found even when this IDE's PATH predates the install
  PlyLocate w=win(env,Set.of("C:\\Users\\Ana\\AppData\\Local\\Mycel\\bin\\mycel.exe","C:\\Users\\Ana\\AppData\\Local\\Mycel\\bin\\ply.cmd"));
  eq("installed mycel.exe",w.onPath(w.env("PATH")),"C:\\Users\\Ana\\AppData\\Local\\Mycel\\bin\\mycel.exe");
  eq("case-insensitive env name",w.env("PATH"),env.get("Path"));
  // npm-style shim on PATH, PATHEXT order, quoted PATH entries
  PlyLocate npm=win(env,Set.of("C:\\Users\\Ana\\AppData\\Roaming\\npm\\mycel.cmd"));
  eq("npm mycel.cmd on PATH",npm.onPath(npm.env("PATH")),"C:\\Users\\Ana\\AppData\\Roaming\\npm\\mycel.cmd");
  PlyLocate quoted=win(env,Set.of("C:\\Program Files\\nodejs\\mycel.exe"));
  eq("quoted PATH entry",quoted.onPath(quoted.env("PATH")),"C:\\Program Files\\nodejs\\mycel.exe");
  eq("extensionless file is not a Windows launcher",win(env,Set.of("C:\\Windows\\system32\\mycel")).onPath(env.get("Path")),null);
  eq("default PATHEXT",win(Map.of(),Set.of()).names("mycel"),List.of("mycel.com","mycel.exe","mycel.bat","mycel.cmd"));
  Map<String,String> pe=new HashMap<>(env); pe.put("PATHEXT",".EXE;.CMD;.JS;.PS1");
  eq("PATHEXT filtered to launchable kinds",win(pe,Set.of()).names("mycel"),List.of("mycel.exe","mycel.cmd"));
  // repo checkout: lang\bin\mycel.cmd (the sh script beside it is not runnable on Windows)
  PlyLocate tree=win(env,Set.of("D:\\src\\olx\\lang\\bin\\mycel","D:\\src\\olx\\lang\\bin\\mycel.cmd"));
  eq("repo shim",tree.inTree("D:\\src\\olx\\lang\\examples\\calc\\main.myc",d->false),"D:\\src\\olx\\lang\\bin\\mycel.cmd");
  eq("UNC repo shim",win(env,Set.of("\\\\nas\\code\\olx\\lang\\bin\\mycel.cmd")).inTree("\\\\nas\\code\\olx\\lang\\x.myc",d->false),"\\\\nas\\code\\olx\\lang\\bin\\mycel.cmd");
  eq("parent of drive root",w.parent("C:\\"),null); eq("parent to drive root",w.parent("C:\\x"),"C:\\");
  eq("parent of UNC share",w.parent("\\\\nas\\code"),null); eq("parent to UNC share",w.parent("\\\\nas\\code\\olx"),"\\\\nas\\code");
  eq("mixed separators",w.parent("C:/a/b\\c.myc"),"C:/a/b");
  // PATH handed to the child: Windows unchanged; macOS gains Homebrew
  eq("windows child PATH untouched",w.childPath(),null);
  PlyLocate mac=new PlyLocate(false,Map.of("PATH","/usr/bin:/bin"),"/Users/ana",Set.of("/Users/ana/.mycel/bin/mycel")::contains);
  eq("mac child PATH",mac.childPath(),"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");
  eq("mac install dir",mac.onPath("/usr/bin"),"/Users/ana/.mycel/bin/mycel");
  eq("mac repo",new PlyLocate(false,Map.of(),"/h",Set.of("/r/lang/bin/mycel")::contains).inTree("/r/lang/examples/a.myc",d->false),"/r/lang/bin/mycel");
  eq("mac parent of root",mac.parent("/"),null); eq("mac parent to root",mac.parent("/a"),"/");
  System.out.println((count-fails)+"/"+count+" locate tests pass");
  if(fails>0)System.exit(1);
 }
}
