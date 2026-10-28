"""生成扩展 ID / RSA key（纯 Python，无第三方依赖）。

Chrome 扩展 ID 算法：SHA256(公钥 DER SPKI) 取前 16 字节，每个 hex 字符 0-f 映射到 a-p。
先用比特浏览器自带的扩展验证算法正确性。
"""
import base64
import hashlib
import json
import os
import random
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def id_from_key_b64(key_b64: str) -> str:
    der = base64.b64decode(key_b64)
    digest = hashlib.sha256(der).digest()[:16]
    return "".join(chr(ord("a") + (b >> 4)) + chr(ord("a") + (b & 0xF)) for b in digest)


def self_test():
    """用比特浏览器自带扩展的 key 反推 ID，验证算法。"""
    cases = [
        ("fhafmlhjdpelfbdglnnpaedipgbnnbja", "2.0.1_0"),
        ("lbehohcbbmmipgcjejkohbihjfcgdpgc", "2.0.6_0"),
    ]
    base = os.path.join(os.environ["APPDATA"], "BitBrowser", "BitExtensions")
    ok = True
    for ext_id, ver in cases:
        mf = os.path.join(base, ext_id, ver, "manifest.json")
        if not os.path.exists(mf):
            print(f"  (跳过，找不到 {mf})")
            continue
        with open(mf, encoding="utf-8") as fh:
            manifest = json.load(fh)
        key = manifest.get("key")
        if not key:
            print(f"  (跳过，manifest 无 key)")
            continue
        computed = id_from_key_b64(key)
        flag = "OK " if computed == ext_id else "MISMATCH"
        ok = ok and computed == ext_id
        print(f"  {flag} 期望={ext_id} 计算={computed}")
    return ok


# ---------------------------------------------------------------- DER / RSA
def der_len(n: int) -> bytes:
    if n < 0x80:
        return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(b)]) + b


def der(tag: int, payload: bytes) -> bytes:
    return bytes([tag]) + der_len(len(payload)) + payload


def der_int(value: int) -> bytes:
    b = value.to_bytes((value.bit_length() + 7) // 8 or 1, "big")
    if b[0] & 0x80:
        b = b"\x00" + b
    return der(0x02, b)


def is_probable_prime(n: int, rounds: int = 32) -> bool:
    if n < 2:
        return False
    small = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]
    for p in small:
        if n % p == 0:
            return n == p
    d = n - 1
    r = 0
    while d % 2 == 0:
        d //= 2
        r += 1
    for _ in range(rounds):
        a = random.randrange(2, n - 1)
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def gen_prime(bits: int) -> int:
    while True:
        candidate = random.getrandbits(bits) | (1 << (bits - 1)) | 1
        if is_probable_prime(candidate):
            return candidate


def rsa_key_spki(bits: int = 2048):
    e = 65537
    half = bits // 2
    while True:
        p = gen_prime(half)
        q = gen_prime(half)
        if p == q:
            continue
        n = p * q
        if n.bit_length() != bits:
            continue
        phi = (p - 1) * (q - 1)
        if phi % e == 0:
            continue
        d = pow(e, -1, phi)
        if d.bit_length() < bits // 2:
            continue
        break
    rsa_pub = der(0x30, der_int(n) + der_int(e))
    alg = der(0x30, der(0x06, bytes.fromhex("2a864886f70d010101")) + der(0x05, b""))
    spki = der(0x30, alg + der(0x03, b"\x00" + rsa_pub))
    return spki, n, e, d, p, q


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "selftest":
        print("== 用比特浏览器自带扩展验证算法 ==")
        print("结果:", "算法正确" if self_test() else "算法不匹配，请勿继续")
    else:
        t0 = time.time()
        spki, n, e, d, p, q = rsa_key_spki(2048)
        key_b64 = base64.b64encode(spki).decode()
        print("耗时: %.1fs" % (time.time() - t0))
        print("KEY_B64:", key_b64)
        print("EXT_ID :", id_from_key_b64(key_b64))
