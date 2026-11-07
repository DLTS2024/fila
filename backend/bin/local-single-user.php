<?php
declare(strict_types=1);
require __DIR__.'/common.php';
try{
    if($argc!==2||!in_array($argv[1],['--inspect','--enable'],true)){fwrite(STDERR,"Use --inspect or --enable after explicit approval.\n");exit(2);}
    $file=realpath((string)getenv('DLOOP_CONFIG_FILE'));
    $expected=realpath(dirname(__DIR__).'/var/personal/config.local.php');
    if(!$file||!$expected||$file!==$expected)throw new RuntimeException('Only the approved personal configuration is supported by this local helper.');
    $config=cliConfig();
    if($config['environment']!=='local'||$config['database']['name']!=='dloop_personal')throw new RuntimeException('Personal local database required.');
    $pdo=\DLoop\Database::connect($config);
    $admins=$pdo->query("SELECT id FROM users WHERE active=1 AND role='admin' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
    if($argv[1]==='--inspect'){
        echo json_encode(['database'=>'dloop_personal','active_administrator_count'=>count($admins),'access_mode'=>$config['access_mode']??'AUTHENTICATED','configured_actor'=>$config['local_user_id']??null,
            'users'=>(int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),'spools'=>(int)$pdo->query('SELECT COUNT(*) FROM spools')->fetchColumn()],JSON_THROW_ON_ERROR),"\n";exit;
    }
    if(count($admins)>1)throw new RuntimeException('Multiple administrators require an explicit actor selection; no automatic choice.');
    $backup=$file.'.before-local-single-user';
    if(is_file($backup))throw new RuntimeException('Existing access-mode backup requires inspection; refusing overwrite.');
    if(!copy($file,$backup))throw new RuntimeException('Private configuration backup failed.');
    $pdo->beginTransaction();
    try{
        if(!$admins){
            $row=$pdo->query('SELECT initialized_at FROM installation_state WHERE id=1 FOR UPDATE')->fetch();
            if(!$row||$row['initialized_at']!==null||(int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn()!==0)throw new RuntimeException('Refusing to replace an existing or inactive user.');
            // Internal audit actor only; random password is neither returned nor
            // retained as a usable credential. Ordinary use needs no email.
            $hash=password_hash(bin2hex(random_bytes(32)),PASSWORD_BCRYPT,['cost'=>12]);
            $pdo->prepare('INSERT INTO users(email,password_hash) VALUES (?,?)')->execute(['local-operator@localhost.invalid',$hash]);
            $id=(string)$pdo->lastInsertId();unset($hash);
            $pdo->exec('UPDATE installation_state SET initialized_at=UTC_TIMESTAMP(6) WHERE id=1');
        }else{$id=(string)$admins[0];}
        $config['access_mode']='LOCAL_SINGLE_USER';$config['local_user_id']=$id;
        $config['local_bridge_token']=bin2hex(random_bytes(32));
        $text="<?php\nreturn ".var_export($config,true).";\n";
        if(file_put_contents($file,$text,LOCK_EX)!==strlen($text))throw new RuntimeException('Access configuration write failed.');
        $pdo->commit();
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();copy($backup,$file);throw $e;}
    echo "Enabled LOCAL_SINGLE_USER for dloop_personal with explicit audit actor. Private backup retained. No existing user or inventory record changed.\n";
}catch(Throwable $e){fwrite(STDERR,'Local mode setup stopped ('.get_class($e)."). No credentials emitted. Inspect before retrying.\n");exit(1);}
