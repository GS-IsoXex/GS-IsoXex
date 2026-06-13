# GS IsoXex

## Sobre

GS IsoXex é uma ferramenta em Node.js criada para ajudar na extração de arquivos `.iso` e `.xiso`, com o objetivo principal de auxiliar usuários a transformar imagens de disco em conteúdo pronto para uso no formato XEX.

## 🎥 Tutorial em vídeo

Assista ao tutorial completo no YouTube para aprender a usar o GS IsoXex do zero!

[![GS IsoXex - Tutorial](https://img.youtube.com/vi/RkMRb1IgCBo/0.jpg)](https://www.youtube.com/watch?v=RkMRb1IgCBo)

[![Assistir no YouTube](https://img.shields.io/badge/Assistir_no_YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/watch?v=RkMRb1IgCBo)

**Se o vídeo te ajudar, dá aquela força!** 👍 Deixe seu **like**, **compartilhe** com quem precisa e **inscreva-se** no canal. Isso nos motiva a continuar atualizando e melhorando o projeto! 🚀

## Pré-requisitos

- Node.js 14 ou superior
- npm (instalado junto com o Node.js)
- Windows, macOS ou Linux
- Espaço livre em disco suficiente para os arquivos extraídos

## Instalar o Node.js

1. Acesse o site oficial: https://nodejs.org/
2. Baixe a versão LTS recomendada para o seu sistema operacional
3. Execute o instalador e siga as instruções
4. Reinicie o terminal após a instalação

Verifique a instalação com:

```bash
node --version
npm --version
```

## Instalação do GS IsoXex

No diretório do projeto, execute:

```bash
cd extract-xiso
npm install
```

Ou, para facilitar, use o arquivo `install.bat`:

```cmd
install.bat
```

Isso instalará todas as dependências necessárias para rodar a ferramenta.

## Como usar

### 1. Adicione seus arquivos

Coloque seus arquivos `.iso`, `.xiso` ou arquivos compactados que contenham `.iso`/`.xiso` na pasta:

```text
extract-xiso/iso/
```

### 2. Abra o projeto no Windows

Se você estiver no Windows, abra a pasta `extract-xiso` no Explorador de Arquivos e confirme que os arquivos a seguir existem:

- `install.bat`
- `extract.bat`
- `config.bat`
- `config.json`
- `bin\extract.js`
- `iso\` (pasta para seus arquivos de entrada)

### 3. Instale as dependências

No terminal, dentro da pasta do projeto:

```bash
npm install
```

Ou use o arquivo de instalação simples:

```cmd
install.bat
```

### 4. Execute a extração

Você pode executar a ferramenta de duas maneiras:

- Pelo terminal:

```bash
node bin/extract.js
```

- No Windows, clique duas vezes em `extract.bat` ou execute:

```cmd
extract.bat
```

### 5. Verifique a saída

Os arquivos extraídos serão salvos em uma pasta de saída próxima aos arquivos de origem ou conforme definido em `config.json`.

## Configuração opcional

Você pode configurar a ferramenta de duas formas:

### Pelo `config.bat` (recomendado no Windows)

Execute o arquivo `config.bat` clicando duas vezes ou pelo terminal:

```cmd
config.bat
```

Ele exibirá um menu interativo perguntando:
- Caminho de entrada (pasta onde estão seus `.iso`/`.xiso`)
- Caminho de saída (pasta para os arquivos extraídos)
- Se deseja apagar a pasta `$SystemUpdate`
- Se deseja apagar o `.iso`/`.xiso` original após extrair
- Se deseja apagar arquivos compactados após extrair

### Manualmente pelo `config.json`

Abra `config.json` com um editor de texto simples (Bloco de Notas, Notepad++, VS Code) e personalize conforme necessário:

```json
{
  "isoDir": "iso",
  "outputDir": "output",
  "deleteSystemUpdate": false,
  "deleteIsoAfterExtract": false,
  "sevenZipPath": "node_modules/7zip-bin/win/x64/7za.exe",
  "unrarPath": "tools/UnRAR.exe"
}
```

- `isoDir`: pasta de entrada onde a ferramenta procura por arquivos `.iso`, `.xiso` e arquivos compactados.
- `outputDir`: pasta de saída para os arquivos extraídos.
- `deleteSystemUpdate`: remove a pasta `$SystemUpdate` durante a extração, quando aplicável.
- `deleteIsoAfterExtract`: remove o arquivo de origem após a extração bem-sucedida.
- `sevenZipPath`: caminho para o executável 7-Zip usado na extração de arquivos compactados.
- `unrarPath`: caminho para o executável UnRAR usado como fallback para arquivos `.rar`.

## Arquivos compactados

GS IsoXex detecta arquivos compactados na pasta `iso/` e tenta extrair qualquer `.iso` ou `.xiso` encontrado dentro deles. Se `deleteIsoAfterExtract` estiver habilitado, o arquivo compactado também será removido depois da extração.

## Exemplo de uso

1. Coloque `meujogo.iso` ou `meujogo.rar` em `extract-xiso/iso/`
2. Execute `node bin/extract.js`
3. Abra a pasta de saída e verifique os arquivos extraídos

## Propósito do projeto

O objetivo do GS IsoXex é oferecer uma ferramenta de apoio para usuários que precisam extrair arquivos ISO para XEX de forma simples e eficiente. Ele não se propõe a ser um conversor completo de formatos avançados; o foco é facilitar a extração e o manuseio de imagens de disco.

## Créditos

A funcionalidade de extração de ISO para XEX neste projeto é baseada no trabalho original de [XboxDev/extract-xiso](https://github.com/XboxDev/extract-xiso).

## Suporte

- Se o Node.js não estiver instalado, acesse https://nodejs.org/
- Se ocorrerem erros, verifique se os arquivos `.iso`/`.xiso` estão íntegros
- Use `config.json` para ajustar caminhos e opções de exclusão
