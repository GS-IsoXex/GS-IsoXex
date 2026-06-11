Instruções para obter um UnRAR portátil (project-local)

Se o `7za.exe` empacotado falhar para alguns arquivos `.rar`, coloque um `UnRAR.exe` no diretório `tools/` do projeto.

1. Baixe o UnRAR para Windows de um fornecedor confiável (por exemplo, site oficial da RARLab: https://www.rarlab.com/).
2. Renomeie o executável para `UnRAR.exe` (se necessário) e coloque em `tools/` na raiz do projeto.
3. Atualize `config.json` (opcional) para apontar para o binário:

```
{
  "unrarPath": "tools/UnRAR.exe"
}
```

4. Rode `node bin\extract.js` novamente.

Observação: Não recomendo baixar binários de fontes não verificadas. Se quiser, eu posso adicionar um script para tentar baixar automaticamente, mas prefiro sua confirmação antes de acessar a internet.
