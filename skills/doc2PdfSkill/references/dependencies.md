# Runtime setup

Use Node.js >=22, LibreOffice Writer, QPDF >=11.4 and Poppler utilities pdftotext, pdffonts and pdftoppm. Balanced and compact also require Ghostscript.

Run scripts/doc2pdf doctor before conversion. PATH and common platform directories are searched. SCRIPTA_SOFFICE, SCRIPTA_QPDF, SCRIPTA_PDFTOTEXT, SCRIPTA_PDFFONTS, SCRIPTA_PDFTOPPM and SCRIPTA_GS can select explicit executables.

Run install-deps to review native package-manager commands. Run install-deps --yes only when installation is authorized. Automatic installation supports macOS Homebrew and Linux apt-get or dnf. See [the dependency record](../dependencies.md) for versions, licenses and update steps.
