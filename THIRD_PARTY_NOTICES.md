# Third-party notices

This application is original code. It bundles the open-source packages listed in `package.json`
(mostly MIT, Apache-2.0 and ISC licensed). Full license texts ship inside each package in `node_modules`.
Packages with notice requirements beyond that are listed below.

## SaxonJS (`saxon-js`, used by `@stafyniaksacha/facturx` for EN 16931 Schematron validation)

Copyright: The copyright in the Software belongs to Saxonica Ltd, except for third-party components
listed in the documentation that are distributed under license.

DISCLAIMER. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS." ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
THE POSSIBILITY OF SUCH DAMAGE.

SaxonJS is redistributed unmodified, in binary form, under the Saxonica SaxonJS License (Version 1.0,
June 2020), included in full at `node_modules/saxon-js/LICENSE.txt`.

## Factur-X / ZUGFeRD schemas

`@stafyniaksacha/facturx` (MIT) ships the Factur-X 1.09 / ZUGFeRD 2.5 XSD schemas and Schematron
published by FNFE-MPE and FeRD for implementers of the standard.

## Design references

Product features and UX patterns were inspired by open-source invoicing and finance tools (for example
Midday and Invoice Ninja). No code was copied from AGPL-licensed projects. Re-used code comes only from
MIT/Apache-2.0 sources such as shadcn/ui.
