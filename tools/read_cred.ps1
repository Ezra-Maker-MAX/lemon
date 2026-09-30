param([string]$OutPath)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class CredMan {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, EntryPoint="CredReadW", SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr credPtr);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  public static CREDENTIAL Read(string target) {
    IntPtr ptr;
    if (!CredRead(target, 1, 0, out ptr)) throw new Exception("CredRead failed err=" + Marshal.GetLastWin32Error());
    return (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
  }
  public static string BlobString(CREDENTIAL c) {
    byte[] b = new byte[c.CredentialBlobSize];
    Marshal.Copy(c.CredentialBlob, b, 0, c.CredentialBlobSize);
    return System.Text.Encoding.Unicode.GetString(b);
  }
}
'@
try {
  $c = [CredMan]::Read("git:https://github.com")
  [IO.File]::WriteAllText($OutPath, [CredMan]::BlobString($c).Trim())
  Write-Output ("saved len=" + $c.CredentialBlobSize + " user=" + $c.UserName)
} catch {
  Write-Output ("ERR: " + $_.Exception.Message)
}
