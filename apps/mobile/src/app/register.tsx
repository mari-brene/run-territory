import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Button, Dim, Input, Screen } from '../components/ui';
import { useSession } from '../lib/session';
import { theme } from '../lib/theme';

export default function Register() {
  const { signUp } = useSession();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await signUp(username.trim(), email.trim(), password);
      router.replace('/map');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}>
          <Input label="Nome de corredor (3 a 20 caracteres)" value={username} onChangeText={setUsername} autoComplete="username-new" />
          <Input label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
          <Input label="Senha (mínimo 6 caracteres)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password-new" />
          {error && <Text style={{ color: theme.danger, marginBottom: 12 }}>{error}</Text>}
          <Button title="Criar conta" onPress={submit} loading={loading} disabled={username.length < 3 || !email || password.length < 6} />
          <Dim style={{ marginTop: 16, textAlign: 'center' }}>Você recebe uma cor de jogador e uma base no local da primeira corrida.</Dim>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
