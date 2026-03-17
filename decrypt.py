# decrypt.py
import os
import sys
import boto3
from botocore.exceptions import ClientError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

BUCKET_NAME = "anubhav-encrypted-files"
S3_FOLDER = "encrypted-files"

def list_files():
    s3 = boto3.client("s3")
    response = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=S3_FOLDER + "/")
    contents = response.get("Contents", [])
    files = [obj["Key"][len(S3_FOLDER) + 1:] for obj in contents if obj["Key"] != S3_FOLDER + "/"]
    if not files:
        print("No files found.")
        return
    for f in files:
        print(f)

def download_and_decrypt(filename, key_path="video.key"):
    s3_key = f"{S3_FOLDER}/{filename}"
    local_enc_path = filename

    # Download from S3
    s3 = boto3.client("s3")
    try:
        s3.download_file(BUCKET_NAME, s3_key, local_enc_path)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchKey"):
            print(f"Error: '{filename}' not found in s3://{BUCKET_NAME}/{S3_FOLDER}/")
        else:
            print(f"Error downloading file: {e}")
        sys.exit(1)

    print(f"Downloaded: {local_enc_path}")

    # Read key
    if not os.path.exists(key_path):
        print(f"Error: key file '{key_path}' not found.")
        os.remove(local_enc_path)
        sys.exit(1)

    with open(key_path, "rb") as f:
        key = f.read()

    # Read encrypted file
    with open(local_enc_path, "rb") as f:
        data = f.read()

    # Decrypt
    nonce = data[:12]
    ciphertext = data[12:]
    aesgcm = AESGCM(key)
    try:
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    except Exception:
        print("Error: Decryption failed. The key may be incorrect or the file is corrupted.")
        os.remove(local_enc_path)
        sys.exit(1)

    # Save decrypted file (strips .enc extension)
    output_path = local_enc_path.replace(".enc", "")
    with open(output_path, "wb") as f:
        f.write(plaintext)

    print(f"Decrypted: {output_path}")

    # Delete local .enc file
    os.remove(local_enc_path)
    print(f"Deleted local: {local_enc_path}")

def usage():
    print("Usage:")
    print("  python decrypt.py ls                      List encrypted files in S3")
    print("  python decrypt.py download <filename>     Download and decrypt a file")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        usage()
        sys.exit(1)

    command = sys.argv[1]

    if command == "ls":
        if len(sys.argv) != 2:
            print("Error: 'ls' takes no arguments.")
            usage()
            sys.exit(1)
        list_files()

    elif command == "download":
        if len(sys.argv) != 3:
            print("Error: 'download' requires exactly one argument: <filename>")
            usage()
            sys.exit(1)
        download_and_decrypt(sys.argv[2])

    else:
        print(f"Error: Unknown command '{command}'.")
        usage()
        sys.exit(1)
