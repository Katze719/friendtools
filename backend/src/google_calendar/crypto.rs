use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::Context;
use rand::RngCore;

/// Encrypt refresh token for storage (`nonce || ciphertext`).
pub fn encrypt_token(key: &[u8; 32], plaintext: &str) -> anyhow::Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let mut buf = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("encrypt: {e}"))?;
    let mut out = nonce_bytes.to_vec();
    out.append(&mut buf);
    Ok(out)
}

pub fn decrypt_token(key: &[u8; 32], blob: &[u8]) -> anyhow::Result<String> {
    if blob.len() < 13 {
        anyhow::bail!("ciphertext too short");
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&blob[..12]);
    let ct = &blob[12..];
    let plain = cipher
        .decrypt(nonce, ct)
        .map_err(|_| anyhow::anyhow!("decrypt failed"))?;
    String::from_utf8(plain).context("refresh token utf-8")
}
