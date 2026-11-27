package ply;
import com.intellij.execution.configurations.GeneralCommandLine;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
/** Locates lang/bin/ply and a project root, and makes the command line work from a Dock-launched IDE (thin PATH). */
public final class PlyPaths {
 private PlyPaths(){}
 /** Search order: explicit override, $PLY_BIN, lang/bin/mycel (or bin/mycel) above the file, an installed `mycel` (Windows: mycel.exe/.cmd, also %LOCALAPPDATA%\\Mycel\\bin) in the usual install dirs or on PATH, the build-time repo path (dev builds only). */
 public static String findPly(String override,String fromPath){
  if(override!=null&&!override.trim().isEmpty())return override.trim();
  String env=System.getenv("PLY_BIN"); if(env!=null&&new File(env).canExecute())return env;
  PlyLocate loc=PlyLocate.host();
  String tree=loc.inTree(fromPath==null?null:new File(fromPath).getAbsolutePath(),d->new File(d).isDirectory()); if(tree!=null)return tree;
  String onPath=loc.onPath(loc.env("PATH")); if(onPath!=null)return onPath;
  String baked=baked(); if(baked!=null&&new File(baked).canExecute())return baked;
  return null;
 }
 /** An installed `mycel` (or the older `ply` name): the IDE's own PATH is thin when launched from the Dock, so the usual install dirs are searched too. */
 static String onPath(String path){ return PlyLocate.host().onPath(path); }
 private static String baked(){
  try(InputStream in=PlyPaths.class.getResourceAsStream("/ply-default-path.txt")){ if(in==null)return null; return new String(in.readAllBytes(),StandardCharsets.UTF_8).trim(); }catch(Exception e){return null;}
 }
 /** Nearest directory at or above `path` holding ply.json, else the file's own directory. */
 public static String workingDir(String path){
  File f=new File(path).getAbsoluteFile(); File dir=f.isDirectory()?f:f.getParentFile();
  for(File d=dir;d!=null;d=d.getParentFile())if(new File(d,"ply.json").isFile())return d.getPath();
  return dir.getPath();
 }
 /** `ply` is `#!/bin/sh … exec node`; the IDE's own PATH usually lacks Homebrew / /usr/local. Windows PATH is left alone (see PlyLocate.childPath). */
 public static void fixEnv(GeneralCommandLine cmd){
  String path=PlyLocate.host().childPath(); if(path!=null)cmd.withEnvironment("PATH",path);
 }
}
