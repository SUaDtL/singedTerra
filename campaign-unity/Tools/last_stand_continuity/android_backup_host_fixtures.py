"""Inert Android OS calls for executing the real bridge; never device qualification."""
SOURCES = {
    "android/app/Activity.java": '''package android.app;
public class Activity {
 public static final int RESULT_OK=-1;
 public boolean rejectDispatch,changingConfigurations,finished;
 public android.content.ContentResolver resolver=new android.content.ContentResolver();
 private android.content.Intent intent=new android.content.Intent();
 public void onCreate(android.os.Bundle state){}
 protected void onActivityResult(int code,int result,android.content.Intent data){}
 protected void onDestroy(){}
 public void runOnUiThread(Runnable task){if(rejectDispatch)throw new IllegalStateException("fixture dispatch refusal");task.run();}
 public void startActivity(android.content.Intent value){}
 public void startActivityForResult(android.content.Intent value,int code){}
 public void finishActivity(int code){}
 public void finish(){finished=true;}
 public boolean isChangingConfigurations(){return changingConfigurations;}
 public android.content.Intent getIntent(){return intent;}
 public void setIntent(android.content.Intent value){intent=value;}
 public android.content.ContentResolver getContentResolver(){return resolver;}
}''',
    "android/content/Intent.java": '''package android.content;
public class Intent {
 public static final String ACTION_OPEN_DOCUMENT="open",ACTION_CREATE_DOCUMENT="create",CATEGORY_OPENABLE="openable",EXTRA_TITLE="title";
 private final java.util.Map<String,Integer> values=new java.util.HashMap<>();
 private android.net.Uri data;
 public Intent(){} public Intent(String action){} public Intent(android.app.Activity owner,Class<?> type){}
 public Intent putExtra(String key,int value){values.put(key,value);return this;}
 public Intent putExtra(String key,String value){return this;}
 public int getIntExtra(String key,int fallback){return values.getOrDefault(key,fallback);}
 public Intent addCategory(String category){return this;} public Intent setType(String type){return this;}
 public android.net.Uri getData(){return data;} public Intent setData(android.net.Uri value){data=value;return this;}
}''',
    "android/content/ContentResolver.java": '''package android.content;
public class ContentResolver {
 public java.io.InputStream input; public java.io.OutputStream output;
 public java.io.InputStream openInputStream(android.net.Uri uri){return input;}
 public java.io.OutputStream openOutputStream(android.net.Uri uri,String mode){return output;}
}''',
    "android/net/Uri.java": '''package android.net;
public final class Uri {
 private final String scheme; private Uri(String value){scheme=value.split(":",2)[0];}
 public static Uri parse(String value){return new Uri(value);} public String getScheme(){return scheme;}
}''',
    "android/os/Bundle.java": "package android.os; public final class Bundle {}",
    "android/os/Looper.java": "package android.os; public final class Looper {public static Looper getMainLooper(){return new Looper();}}",
    "android/os/Handler.java": '''package android.os;
public final class Handler {
 public static int scheduled;
 public static final java.util.List<Runnable> pending=new java.util.concurrent.CopyOnWriteArrayList<>();
 public Handler(Looper looper){}
 public boolean post(Runnable task){task.run();return true;}
 public boolean postDelayed(Runnable task,long delay){if(delay!=30000)throw new AssertionError("deadline changed");scheduled++;pending.add(task);return true;}
 public void removeCallbacks(Runnable task){pending.remove(task);}
 public static void fire(Runnable task){pending.remove(task);task.run();}
}''',
    "android/util/Base64.java": '''package android.util;
public final class Base64 {
 public static final int NO_WRAP=2;
 public static byte[] decode(String value,int flags){return java.util.Base64.getDecoder().decode(value);}
 public static String encodeToString(byte[] value,int flags){return java.util.Base64.getEncoder().encodeToString(value);}
}''',
}
