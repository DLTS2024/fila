<?php
declare(strict_types=1);
// Enforce that bootstrap includes only declarations, not hidden runtime calls.
$root=dirname(__DIR__).'/src';
$bootstrap=file_get_contents($root.'/bootstrap.php');
preg_match_all("~require_once __DIR__ \. '/([A-Za-z]+\.php)';~",$bootstrap,$matches);
if(count($matches[1])!==11)throw new RuntimeException('Unexpected bootstrap dependency list.');
foreach (array_merge(['bootstrap.php'],$matches[1]) as $file) {
    $tokens=token_get_all(file_get_contents($root.'/'.$file));
    for($i=0;$i<count($tokens);$i++) {
        $t=$tokens[$i];
        if(is_array($t)&&in_array($t[0],[T_OPEN_TAG,T_WHITESPACE,T_COMMENT,T_DOC_COMMENT],true))continue;
        if(is_array($t)&&in_array($t[0],[T_DECLARE,T_NAMESPACE,T_REQUIRE_ONCE],true)){
            while($tokens[$i]!==';')$i++;
            continue;
        }
        if(is_array($t)&&$t[0]===T_FINAL)continue;
        if(is_array($t)&&$t[0]===T_CLASS){
            while($tokens[$i]!=='{')$i++;
            $depth=1;
            while($depth>0){$t=$tokens[++$i];if($t==='{')$depth++;elseif($t==='}')$depth--;elseif(is_array($t)&&in_array($t[0],[T_CURLY_OPEN,T_DOLLAR_OPEN_CURLY_BRACES],true))$depth++;}
            continue;
        }
        throw new RuntimeException('Unexpected top-level executable code in '.$file);
    }
}
echo "PASS: bootstrap and all 11 dependencies contain declarations/includes only.\n";
