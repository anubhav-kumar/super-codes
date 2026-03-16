# decrypt.py
import sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def decrypt_video(enc_path, key_path="video.key"):
    # Read the key
    with open(key_path, "rb") as f:
        key = f.read()

    # Read the encrypted file
    with open(enc_path, "rb") as f:
        data = f.read()

    # Extract nonce (first 12 bytes) and ciphertext
    nonce = data[:12]
    ciphertext = data[12:]

    # Decrypt
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)

    # Save decrypted file (strips .enc extension)
    output_path = enc_path.replace(".enc", "")
    with open(output_path, "wb") as f:
        f.write(plaintext)

    print(f"✅ Decrypted: {output_path}")

if __name__ == "__main__":
    enc_path = sys.argv[1] if len(sys.argv) > 1 else input("Enter encrypted file path (.enc): ")
    decrypt_video(enc_path)