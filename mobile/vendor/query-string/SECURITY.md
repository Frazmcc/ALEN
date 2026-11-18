# Local query-string security patch

This copy retains the MIT-licensed query-string 7.1.3 API used by Expo's dependency tree. The vulnerable decode-uri-component dependency is replaced by the native decodeURIComponent function. Malformed percent encodings are returned unchanged rather than retried recursively. Valid strings, arrays and URL serialization retain the existing API.

Remove this copy and the package override once the supported Expo dependency tree no longer includes the vulnerable decoder. The upstream license is preserved in license.
