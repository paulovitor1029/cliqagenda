# Armazenamento real de imagens

O sistema agora suporta dois modos:

## 1. Local

Padrão para desenvolvimento.

```env
STORAGE_PROVIDER=local
```

As imagens ficam em:

```text
backend/uploads
```

## 2. Cloudinary

Recomendado para produção.

```env
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=seu_cloud_name
CLOUDINARY_API_KEY=sua_api_key
CLOUDINARY_API_SECRET=sua_api_secret
CLOUDINARY_FOLDER=cliqagenda
```

Quando `STORAGE_PROVIDER=cloudinary`, logos e fotos dos profissionais são enviadas para a nuvem e o sistema salva a URL segura retornada pelo provedor.
