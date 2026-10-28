using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace TemuDownlistHelper
{
    internal static class Program
    {
        private const string Version = "1.0.0";
        private const string RootFolderName = "下架图片合集";
        private const string MainFolderName = "主图保存";
        private const string BackFolderName = "背面图保存";
        private const int MaxImageBytes = 30 * 1024 * 1024;
        private const int MaxFileBytes = 100 * 1024 * 1024;
        private const int HttpPort = 17866;
        private const string ExtensionOrigin =
            "chrome-extension://mcgadkimbdnkdmcchihilkaghjefklpo";
        private const string HttpToken = "c2f0e8dc91b94f14aa17d7f37b09ea66";

        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer
        {
            MaxJsonLength = 128 * 1024 * 1024
        };

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        private static extern int SHGetKnownFolderPath(
            ref Guid rfid,
            uint flags,
            IntPtr token,
            out IntPtr path
        );

        public static void Main(string[] args)
        {
            try
            {
                System.Net.ServicePointManager.SecurityProtocol |=
                    System.Net.SecurityProtocolType.Tls12;

                if (args != null && args.Length > 0 && args[0] == "--http")
                {
                    RunHttpServer();
                }
                else
                {
                    RunNativeMessaging();
                }
            }
            catch (Exception error)
            {
                WriteLog(error.ToString());
            }
        }

        private static void RunNativeMessaging()
        {
            Stream stdin = Console.OpenStandardInput();
            Stream stdout = Console.OpenStandardOutput();
            while (true)
            {
                byte[] lengthBytes = ReadExact(stdin, 4);
                if (lengthBytes == null || lengthBytes.Length != 4)
                {
                    break;
                }

                int length = BitConverter.ToInt32(lengthBytes, 0);
                if (length <= 0 || length > MaxFileBytes)
                {
                    break;
                }

                byte[] payloadBytes = ReadExact(stdin, length);
                if (payloadBytes == null || payloadBytes.Length != length)
                {
                    break;
                }

                string requestJson = Encoding.UTF8.GetString(payloadBytes);
                Dictionary<string, object> request =
                    Serializer.DeserializeObject(requestJson) as Dictionary<string, object>;
                Dictionary<string, object> response = HandleRequest(request);
                byte[] responseBytes = Encoding.UTF8.GetBytes(Serializer.Serialize(response));
                byte[] responseLength = BitConverter.GetBytes(responseBytes.Length);
                stdout.Write(responseLength, 0, responseLength.Length);
                stdout.Write(responseBytes, 0, responseBytes.Length);
                stdout.Flush();
            }
        }

        private static void RunHttpServer()
        {
            TcpListener listener = new TcpListener(IPAddress.Loopback, HttpPort);
            listener.Start();
            WriteLog("HTTP helper listening on 127.0.0.1:" + HttpPort);
            while (true)
            {
                TcpClient client = listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(
                    delegate(object state)
                    {
                        using (TcpClient connection = (TcpClient)state)
                        {
                            HandleHttpConnection(connection);
                        }
                    },
                    client
                );
            }
        }

        private static void HandleHttpConnection(TcpClient client)
        {
            try
            {
                client.ReceiveTimeout = 60000;
                client.SendTimeout = 60000;
                using (NetworkStream stream = client.GetStream())
                {
                    byte[] requestBytes = ReadHttpRequest(stream, 1024 * 1024);
                    if (requestBytes.Length == 0)
                    {
                        return;
                    }

                    string raw = Encoding.UTF8.GetString(requestBytes);
                    int split = raw.IndexOf("\r\n\r\n", StringComparison.Ordinal);
                    if (split < 0)
                    {
                        WriteHttpResponse(
                            stream,
                            400,
                            "Bad Request",
                            "application/json",
                            Error("BAD_REQUEST", "HTTP headers incomplete")
                        );
                        return;
                    }

                    string headersText = raw.Substring(0, split);
                    string body = raw.Substring(split + 4);
                    string[] headerLines = headersText.Split(
                        new string[] { "\r\n" },
                        StringSplitOptions.None
                    );
                    string requestLine = headerLines[0];
                    string[] requestParts = requestLine.Split(' ');
                    if (requestParts.Length < 2)
                    {
                        WriteHttpResponse(
                            stream,
                            400,
                            "Bad Request",
                            "application/json",
                            Error("BAD_REQUEST", "Invalid request line")
                        );
                        return;
                    }

                    string method = requestParts[0];
                    string path = requestParts[1];
                    Dictionary<string, string> headers =
                        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    for (int index = 1; index < headerLines.Length; index++)
                    {
                        int colon = headerLines[index].IndexOf(':');
                        if (colon > 0)
                        {
                            string key = headerLines[index].Substring(0, colon).Trim();
                            string value = headerLines[index].Substring(colon + 1).Trim();
                            headers[key] = value;
                        }
                    }

                    int contentLength = 0;
                    string contentLengthText;
                    if (headers.TryGetValue("Content-Length", out contentLengthText))
                    {
                        int.TryParse(contentLengthText, out contentLength);
                    }
                    string origin;
                    headers.TryGetValue("Origin", out origin);
                    if (method == "OPTIONS")
                    {
                        WriteHttpResponse(
                            stream,
                            204,
                            "No Content",
                            "text/plain",
                            null,
                            origin
                        );
                        return;
                    }
                    if (method != "POST" && method != "GET")
                    {
                        WriteHttpResponse(
                            stream,
                            405,
                            "Method Not Allowed",
                            "application/json",
                            Error("METHOD_NOT_ALLOWED", "Only POST and GET are supported"),
                            origin
                        );
                        return;
                    }

                    if (path == "/ping" && method == "GET")
                    {
                        Dictionary<string, object> ping = Ping();
                        ping["httpPort"] = HttpPort;
                        WriteHttpResponse(
                            stream,
                            200,
                            "OK",
                            "application/json",
                            ping,
                            origin
                        );
                        return;
                    }

                    if (path != "/rpc" || method != "POST")
                    {
                        WriteHttpResponse(
                            stream,
                            404,
                            "Not Found",
                            "application/json",
                            Error("NOT_FOUND", "Unknown endpoint"),
                            origin
                        );
                        return;
                    }

                    string token;
                    headers.TryGetValue("X-Temu-Helper-Token", out token);
                    bool originAllowed =
                        string.IsNullOrEmpty(origin) ||
                        origin == ExtensionOrigin;
                    if (!originAllowed || token != HttpToken)
                    {
                        WriteHttpResponse(
                            stream,
                            403,
                            "Forbidden",
                            "application/json",
                            Error("UNAUTHORIZED", "Invalid extension origin or token"),
                            origin
                        );
                        return;
                    }

                    Dictionary<string, object> request =
                        Serializer.DeserializeObject(body) as Dictionary<string, object>;
                    Dictionary<string, object> response = HandleRequest(request);
                    WriteHttpResponse(
                        stream,
                        200,
                        "OK",
                        "application/json",
                        response,
                        origin
                    );
                }
            }
            catch (Exception error)
            {
                WriteLog("HTTP handler error: " + error);
            }
        }

        private static byte[] ReadHttpRequest(NetworkStream stream, int maxBytes)
        {
            using (MemoryStream memory = new MemoryStream())
            {
                byte[] buffer = new byte[8192];
                int headerEnd = -1;
                int contentLength = 0;
                while (memory.Length < maxBytes)
                {
                    int read = stream.Read(buffer, 0, buffer.Length);
                    if (read <= 0)
                    {
                        break;
                    }
                    memory.Write(buffer, 0, read);
                    byte[] data = memory.ToArray();
                    if (headerEnd < 0)
                    {
                        headerEnd = IndexOf(data, Encoding.ASCII.GetBytes("\r\n\r\n"));
                        if (headerEnd >= 0)
                        {
                            string headerText = Encoding.ASCII.GetString(
                                data,
                                0,
                                headerEnd
                            );
                            string[] lines = headerText.Split(
                                new string[] { "\r\n" },
                                StringSplitOptions.None
                            );
                            for (int i = 1; i < lines.Length; i++)
                            {
                                if (
                                    lines[i].StartsWith(
                                        "Content-Length:",
                                        StringComparison.OrdinalIgnoreCase
                                    )
                                )
                                {
                                    int.TryParse(lines[i].Substring(15).Trim(), out contentLength);
                                }
                            }
                        }
                    }
                    if (
                        headerEnd >= 0 &&
                        contentLength >= 0 &&
                        data.Length >= headerEnd + 4 + contentLength
                    )
                    {
                        return data;
                    }
                }
                return memory.ToArray();
            }
        }

        private static int IndexOf(byte[] haystack, byte[] needle)
        {
            for (int index = 0; index <= haystack.Length - needle.Length; index++)
            {
                bool match = true;
                for (int offset = 0; offset < needle.Length; offset++)
                {
                    if (haystack[index + offset] != needle[offset])
                    {
                        match = false;
                        break;
                    }
                }
                if (match)
                {
                    return index;
                }
            }
            return -1;
        }

        private static void WriteHttpResponse(
            NetworkStream stream,
            int statusCode,
            string statusText,
            string contentType,
            object payload,
            string requestOrigin = null
        )
        {
            byte[] bodyBytes = payload == null
                ? new byte[0]
                : Encoding.UTF8.GetBytes(Serializer.Serialize(payload));
            string allowOrigin = originAllowed(requestOrigin)
                ? (string.IsNullOrEmpty(requestOrigin) ? ExtensionOrigin : requestOrigin)
                : ExtensionOrigin;
            string header =
                "HTTP/1.1 " + statusCode + " " + statusText + "\r\n" +
                "Content-Type: " + contentType + "; charset=utf-8\r\n" +
                "Content-Length: " + bodyBytes.Length + "\r\n" +
                "Cache-Control: no-store\r\n" +
                "Access-Control-Allow-Origin: " + allowOrigin + "\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type, X-Temu-Helper-Token\r\n" +
                "Vary: Origin\r\n" +
                "Connection: close\r\n\r\n";
            byte[] headerBytes = Encoding.ASCII.GetBytes(header);
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (bodyBytes.Length > 0)
            {
                stream.Write(bodyBytes, 0, bodyBytes.Length);
            }
            stream.Flush();
        }

        private static bool originAllowed(string origin)
        {
            return string.IsNullOrEmpty(origin) || origin == ExtensionOrigin;
        }

        private static Dictionary<string, object> HandleRequest(
            Dictionary<string, object> request
        )
        {
            try
            {
                if (request == null)
                {
                    return Error("EMPTY_REQUEST", "请求为空");
                }

                string action = TextValue(request, "action");
                switch (action)
                {
                    case "ping":
                        return Ping();
                    case "ensureFolders":
                        return EnsureFolders(TextValue(request, "category"));
                    case "saveImage":
                        return SaveImage(
                            TextValue(request, "category"),
                            TextValue(request, "filename"),
                            TextValue(request, "url")
                        );
                    case "saveFile":
                        return SaveFile(
                            TextValue(request, "relativePath"),
                            TextValue(request, "base64")
                        );
                    default:
                        return Error("UNKNOWN_ACTION", "不支持的操作：" + action);
                }
            }
            catch (Exception error)
            {
                WriteLog(error.ToString());
                return Error("HELPER_ERROR", error.Message);
            }
        }

        private static Dictionary<string, object> Ping()
        {
            string desktop = GetDesktopPath();
            string root = Path.Combine(desktop, RootFolderName);
            Dictionary<string, object> result = Success();
            result["version"] = Version;
            result["desktop"] = desktop;
            result["root"] = root;
            result["helperPath"] = typeof(Program).Assembly.Location;
            return result;
        }

        private static Dictionary<string, object> EnsureFolders(string rawCategory)
        {
            string category = SafeName(rawCategory);
            if (string.IsNullOrEmpty(category))
            {
                return Error("CATEGORY_REQUIRED", "货号分类为空");
            }

            string root = Path.Combine(GetDesktopPath(), RootFolderName);
            string categoryDir = Path.Combine(root, category);
            string mainDir = Path.Combine(categoryDir, MainFolderName);
            string backDir = Path.Combine(categoryDir, BackFolderName);
            Directory.CreateDirectory(mainDir);
            Directory.CreateDirectory(backDir);

            Dictionary<string, object> result = Success();
            result["root"] = root;
            result["category"] = category;
            result["categoryDir"] = categoryDir;
            result["mainDir"] = mainDir;
            result["backDir"] = backDir;
            return result;
        }

        private static Dictionary<string, object> SaveImage(
            string rawCategory,
            string rawFilename,
            string url
        )
        {
            string category = SafeName(rawCategory);
            string filename = SafeFileName(rawFilename);
            if (string.IsNullOrEmpty(category))
            {
                return Error("CATEGORY_REQUIRED", "货号分类为空");
            }
            if (string.IsNullOrEmpty(filename))
            {
                return Error("FILENAME_REQUIRED", "图片文件名为空");
            }

            string root = Path.Combine(GetDesktopPath(), RootFolderName);
            string mainDir = Path.Combine(root, category, MainFolderName);
            Directory.CreateDirectory(mainDir);
            string targetPath = ResolveWithin(root, Path.Combine(category, MainFolderName, filename));

            if (File.Exists(targetPath) && new FileInfo(targetPath).Length > 0)
            {
                Dictionary<string, object> existing = Success();
                existing["reused"] = true;
                FillImageInfo(existing, targetPath);
                return existing;
            }

            byte[] imageBytes = DownloadBytes(url, MaxImageBytes);
            int width;
            int height;
            ValidateImage(imageBytes, out width, out height);
            if (width < 200 || height < 200)
            {
                throw new InvalidOperationException(
                    "图片尺寸异常：" + width + " × " + height
                );
            }

            string tempPath = targetPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllBytes(tempPath, imageBytes);
                File.Move(tempPath, targetPath);
            }
            finally
            {
                if (File.Exists(tempPath))
                {
                    File.Delete(tempPath);
                }
            }

            Dictionary<string, object> result = Success();
            result["reused"] = false;
            result["width"] = width;
            result["height"] = height;
            FillImageInfo(result, targetPath);
            return result;
        }

        private static Dictionary<string, object> SaveFile(
            string rawRelativePath,
            string base64
        )
        {
            if (string.IsNullOrEmpty(base64))
            {
                return Error("CONTENT_REQUIRED", "文件内容为空");
            }

            byte[] content = Convert.FromBase64String(base64);
            if (content.Length > MaxFileBytes)
            {
                return Error("FILE_TOO_LARGE", "结果文件超过大小限制");
            }

            string root = Path.Combine(GetDesktopPath(), RootFolderName);
            Directory.CreateDirectory(root);
            string proposed = ResolveWithin(root, rawRelativePath);
            string target = UniquePath(proposed);
            string tempPath = target + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllBytes(tempPath, content);
                File.Move(tempPath, target);
            }
            finally
            {
                if (File.Exists(tempPath))
                {
                    File.Delete(tempPath);
                }
            }

            Dictionary<string, object> result = Success();
            result["path"] = target;
            return result;
        }

        private static byte[] DownloadBytes(string rawUrl, int maxBytes)
        {
            Uri uri;
            if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out uri))
            {
                throw new InvalidOperationException("图片 URL 无效");
            }
            if (
                !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            )
            {
                throw new InvalidOperationException("图片 URL 必须使用 HTTPS");
            }
            if (
                !(
                    uri.Host.Equals("kwcdn.com", StringComparison.OrdinalIgnoreCase) ||
                    uri.Host.EndsWith(".kwcdn.com", StringComparison.OrdinalIgnoreCase)
                )
            )
            {
                throw new InvalidOperationException("不允许从非 Temu 图片域名下载：" + uri.Host);
            }

            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(uri);
            request.Method = "GET";
            request.Timeout = 30000;
            request.ReadWriteTimeout = 60000;
            request.AllowAutoRedirect = true;
            request.UserAgent = "Mozilla/5.0 TemuDownlistHelper/1.0";

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                int statusCode = (int)response.StatusCode;
                if (statusCode < 200 || statusCode >= 300)
                {
                    throw new InvalidOperationException("图片下载 HTTP " + statusCode);
                }
                if (response.ContentLength > maxBytes)
                {
                    throw new InvalidOperationException("图片超过大小限制");
                }

                using (Stream stream = response.GetResponseStream())
                using (MemoryStream memory = new MemoryStream())
                {
                    byte[] buffer = new byte[65536];
                    int read;
                    while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        memory.Write(buffer, 0, read);
                        if (memory.Length > maxBytes)
                        {
                            throw new InvalidOperationException("图片超过大小限制");
                        }
                    }
                    return memory.ToArray();
                }
            }
        }

        private static void ValidateImage(byte[] bytes, out int width, out int height)
        {
            if (bytes == null || bytes.Length == 0)
            {
                throw new InvalidOperationException("图片内容为空");
            }

            using (MemoryStream memory = new MemoryStream(bytes))
            using (Image image = Image.FromStream(memory, false, true))
            {
                width = image.Width;
                height = image.Height;
                if (width <= 0 || height <= 0)
                {
                    throw new InvalidOperationException("图片尺寸无效");
                }
            }
        }

        private static void FillImageInfo(
            Dictionary<string, object> result,
            string path
        )
        {
            byte[] bytes = File.ReadAllBytes(path);
            int width;
            int height;
            ValidateImage(bytes, out width, out height);
            result["path"] = path;
            result["filename"] = Path.GetFileName(path);
            result["size"] = bytes.Length;
            result["sha256"] = Sha256(bytes);
            result["width"] = width;
            result["height"] = height;
        }

        private static string Sha256(byte[] bytes)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(bytes);
                StringBuilder builder = new StringBuilder(hash.Length * 2);
                foreach (byte value in hash)
                {
                    builder.Append(value.ToString("X2"));
                }
                return builder.ToString();
            }
        }

        private static string SafeName(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return "";
            }
            char[] invalid = Path.GetInvalidFileNameChars();
            StringBuilder builder = new StringBuilder();
            foreach (char character in value.Trim())
            {
                if (Array.IndexOf(invalid, character) < 0)
                {
                    builder.Append(character);
                }
            }
            return builder.ToString().Trim().TrimEnd('.');
        }

        private static string SafeFileName(string value)
        {
            string name = SafeName(value);
            if (name == "." || name == "..")
            {
                return "";
            }
            return name;
        }

        private static string ResolveWithin(string root, string relativePath)
        {
            if (string.IsNullOrWhiteSpace(relativePath))
            {
                throw new InvalidOperationException("相对路径为空");
            }
            string normalizedRoot = Path.GetFullPath(root)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string fullPath = Path.GetFullPath(Path.Combine(normalizedRoot, relativePath));
            string rootPrefix =
                normalizedRoot + Path.DirectorySeparatorChar.ToString();
            if (
                !fullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(fullPath, normalizedRoot, StringComparison.OrdinalIgnoreCase)
            )
            {
                throw new InvalidOperationException("路径超出允许的输出目录");
            }
            return fullPath;
        }

        private static string UniquePath(string proposedPath)
        {
            if (!File.Exists(proposedPath))
            {
                return proposedPath;
            }
            string directory = Path.GetDirectoryName(proposedPath);
            string filename = Path.GetFileNameWithoutExtension(proposedPath);
            string extension = Path.GetExtension(proposedPath);
            for (int index = 2; index < 10000; index++)
            {
                string candidate = Path.Combine(
                    directory,
                    filename + "_" + index + extension
                );
                if (!File.Exists(candidate))
                {
                    return candidate;
                }
            }
            throw new InvalidOperationException("无法生成不重复的结果文件名");
        }

        private static string GetDesktopPath()
        {
            Guid folderId = new Guid("B4BFCC3A-DB2C-424C-B029-7FE99A87C641");
            IntPtr pointer = IntPtr.Zero;
            try
            {
                int result = SHGetKnownFolderPath(
                    ref folderId,
                    0,
                    IntPtr.Zero,
                    out pointer
                );
                if (result == 0 && pointer != IntPtr.Zero)
                {
                    string path = Marshal.PtrToStringUni(pointer);
                    if (!string.IsNullOrEmpty(path) && Directory.Exists(path))
                    {
                        return path;
                    }
                }
            }
            finally
            {
                if (pointer != IntPtr.Zero)
                {
                    Marshal.FreeCoTaskMem(pointer);
                }
            }

            string fallback = Environment.GetFolderPath(
                Environment.SpecialFolder.DesktopDirectory
            );
            if (string.IsNullOrEmpty(fallback))
            {
                throw new InvalidOperationException("无法定位 Windows 桌面目录");
            }
            return fallback;
        }

        private static string TextValue(
            Dictionary<string, object> request,
            string key
        )
        {
            object value;
            if (!request.TryGetValue(key, out value) || value == null)
            {
                return "";
            }
            return Convert.ToString(value);
        }

        private static Dictionary<string, object> Success()
        {
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["success"] = true;
            return result;
        }

        private static Dictionary<string, object> Error(string code, string message)
        {
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["success"] = false;
            result["code"] = code;
            result["error"] = message;
            return result;
        }

        private static byte[] ReadExact(Stream stream, int count)
        {
            byte[] buffer = new byte[count];
            int offset = 0;
            while (offset < count)
            {
                int read = stream.Read(buffer, offset, count - offset);
                if (read <= 0)
                {
                    return offset == 0 ? null : new byte[0];
                }
                offset += read;
            }
            return buffer;
        }

        private static void WriteLog(string message)
        {
            try
            {
                string directory = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "TemuDownlistHelper"
                );
                Directory.CreateDirectory(directory);
                File.AppendAllText(
                    Path.Combine(directory, "helper.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + "\r\n",
                    Encoding.UTF8
                );
            }
            catch
            {
                // Logging must never break the native messaging protocol.
            }
        }
    }
}
