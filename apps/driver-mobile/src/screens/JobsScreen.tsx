import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PostResponse } from '@dispatch/shared/contracts';
import { fetchPublic, fetchWithAuth, logout } from '../services/api';
import { subscribeForegroundMessages } from '../services/fcm';

interface Job {
  id: string;
  order_ref: string;
  status: string;
  pickup_address: string;
  delivery_address: string;
}

interface Props {
  onLogout: () => void;
}

export function JobsScreen({ onLogout }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchWithAuth<Job[]>('/api/v1/drivers/me/jobs');
      setJobs(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Session expired') {
        onLogout();
        return;
      }
      Alert.alert('Error', 'Failed to load jobs. Pull to refresh.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [onLogout]);

  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchPublic<PostResponse[]>('/api/v1/posts?limit=5');
      setPosts(data);
    } catch {
      // Keep jobs usable even if posts fail.
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    loadPosts();
    const unsubscribe = subscribeForegroundMessages((title, body) => {
      Alert.alert(title, body);
      loadJobs();
    });
    return unsubscribe;
  }, [loadJobs, loadPosts]);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white shadow-sm px-4 py-3 flex-row justify-between items-center">
        <Text className="text-xl font-bold text-gray-900">My Jobs</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text className="text-sm text-gray-500">Sign out</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              loadJobs();
              loadPosts();
            }}
          />
        }
        ListHeaderComponent={
          <View className="mx-4 mt-4 mb-2">
            <Text className="text-base font-semibold text-gray-900">Latest Posts</Text>
            {posts.length === 0 ? (
              <Text className="text-sm text-gray-400 mt-2">No posts available.</Text>
            ) : (
              <View className="mt-2 gap-2">
                {posts.map((post) => (
                  <View key={post.id} className="bg-white rounded-xl p-4 shadow-sm">
                    <Text className="font-semibold text-gray-900">{post.title}</Text>
                    <Text className="text-xs text-gray-500 mt-1">{post.summary}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text className="text-base font-semibold text-gray-900 mt-5">My Jobs</Text>
          </View>
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-gray-400 text-base">No jobs assigned yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="bg-white mx-4 my-2 rounded-xl p-4 shadow-sm">
            <View className="flex-row justify-between items-start mb-2">
              <Text className="font-semibold text-gray-900">#{item.order_ref}</Text>
              <View className="bg-blue-100 rounded-full px-3 py-1">
                <Text className="text-xs font-medium text-blue-800">
                  {item.status.replace(/_/g, ' ')}
                </Text>
              </View>
            </View>
            <Text className="text-sm text-gray-500 mb-1">
              📦 {item.pickup_address}
            </Text>
            <Text className="text-sm text-gray-500">
              📍 {item.delivery_address}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 16 }}
      />
    </SafeAreaView>
  );
}
