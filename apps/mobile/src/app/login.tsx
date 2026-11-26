import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Button, Dim, Input, Screen } from '../components/ui';
import { useSession } from '../lib/session';
import { theme } from '../lib/theme';

export default function Login() {
  const { signIn } = useSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn(login, password);
      router.replace('/map');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <Input label="Usuário ou e-mail" value={login} onChangeText={setLogin} autoComplete="username" />
        <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
        {error && <Text style={{ color: theme.danger, marginBottom: 12 }}>{error}</Text>}
        <Button title="Entrar" onPress={submit} loading={loading} disabled={!login || !password} />
        <View style={{ marginTop: 20, alignItems: 'center' }}>
          <Dim>
            Não tem conta?{' '}
            <Text style={{ color: theme.accent, fontWeight: '700' }} onPress={() => router.replace('/register')}>
              Cadastre-se
            </Text>
          </Dim>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
