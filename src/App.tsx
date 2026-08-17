/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardOverview from './components/DashboardOverview';
import TransferPage from './components/TransferPage';
import CardsPage from './components/CardsPage';
import NotificationsPage from './components/NotificationsPage';
import TransactionHistory from './components/TransactionHistory';
import SummaryPage from './components/SummaryPage';
import StocksPage from './components/StocksPage';
import LoginPage from './components/LoginPage';
import VerifyIdentityPage from './components/VerifyIdentityPage';
import LoansPage from './components/LoansPage';
import SecurityPage from './components/SecurityPage';
import CreatePinPage from './components/CreatePinPage';
import SandboxPanel from './components/SandboxPanel';
import AdminPanel from './components/AdminPanel';
import ProfilePage from './components/ProfilePage';
import DepositPage from './components/DepositPage';
import NotificationAlert from './components/NotificationAlert';
import SupportWidget from './components/SupportWidget';
import JointAccountsPanel from './components/JointAccountsPanel';
import EmailVerificationBanner from './components/EmailVerificationBanner';
import MobileBottomNav from './components/MobileBottomNav';
import { detectLanguagePreference, getLanguageByCode, LanguageCode, normalizeLanguageCode } from './lib/translations';
import { RestrictedModal, TransferSuccessModal, TransferCodeModal, TransferVerificationModal } from './components/Modals';
import { motion, AnimatePresence } from 'motion/react';
import { USER_DATA, TRANSACTIONS } from './constants';
import { cn } from './lib/utils';
import { clearAuthSession, getAuthToken, getAuthUser, storeAuthSession, updateStoredAuthUser } from './lib/auth-storage';

const formatTransactionCategory = (category?: string) => {
  const normalized = String(category || '').trim().toLowerCase();

  const labels: Record<string, string> = {
    deposit: 'Deposit',
    account_debit: 'Account Debit',
    transfer: 'Transfer',
    withdrawal: 'Withdrawal',
    loan_disbursement: 'Loan Disbursement',
    sandbox_balance_adjustment: 'Sandbox Adjustment',
    balance_adjustment: 'Balance Adjustment',
    admin_balance_adjustment: 'Account Adjustment',
    manual_entry: 'Account Ledger'
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  return category
    ? String(category).replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : 'Transfer';
};

const formatTransactionDescription = (description?: string) => {
  const value = String(description || '').trim();
  const internalMatch = value.match(/^Internal Transfer (?:to|from) (.+) \(([^)]+)\)$/i);
  if (internalMatch) return `${internalMatch[1]} · ${internalMatch[2]}`;

  const externalMatch = value.match(/^Wire\/External Transfer to (.+) \(.+ \/ ([^)]+)\)$/i);
  if (externalMatch) return `${externalMatch[1]} · ${externalMatch[2]}`;

  return value || 'Bank Transfer';
};

export default function App() {
const clearStoredSession = useCallback(() => {
  clearAuthSession();
  localStorage.removeItem('bank_transactions');
  localStorage.removeItem('bank_balance');
  localStorage.removeItem('bank_transfer_count');
}, []);

useEffect(() => {
  try {
    const saved = getAuthUser();

    if (!saved) return;

    const user = JSON.parse(saved);

    if (user.id_front_image || user.id_back_image) {
      delete user.id_front_image;
      delete user.id_back_image;

      updateStoredAuthUser(JSON.stringify(user));
    }
  } catch (err) {
    console.error(err);
  }
}, []);
  
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = getAuthUser();
    return saved ? JSON.parse(saved) : USER_DATA;
  });

  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });

  const [lang, setLang] = useState<LanguageCode>('en');

  useEffect(() => {
    let ignore = false;

    const initializeLanguage = async () => {
      const saved = normalizeLanguageCode(localStorage.getItem('app_lang'));
      const detected = saved || await detectLanguagePreference();

      if (ignore) return;

      setLang(detected);
      localStorage.setItem('app_lang', detected);

      if (typeof document !== 'undefined') {
        document.documentElement.lang = detected;
        document.documentElement.dir = getLanguageByCode(detected)?.direction || 'ltr';
      }
    };

    initializeLanguage();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = getLanguageByCode(lang)?.direction || 'ltr';
    }
  }, [lang]);

  const handleLanguageChange = async (code: LanguageCode) => {
    setLang(code);
    localStorage.setItem('app_lang', code);

    if (typeof document !== 'undefined') {
      document.documentElement.lang = code;
      document.documentElement.dir = getLanguageByCode(code)?.direction || 'ltr';
    }

    try {
      const token = getAuthToken();
      if (token) {
        await fetch('/api/v1/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ preferred_language: code })
        });
      }
    } catch (error) {
      console.error('Failed to persist language preference', error);
    }
  };

  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).has('support') ? 'admin' : 'dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRestrictedModalOpen, setIsRestrictedModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isTransferCodeModalOpen, setIsTransferCodeModalOpen] = useState(false);
  const [isTransferVerificationOpen, setIsTransferVerificationOpen] = useState(false);
  const [authorizedTransferPin, setAuthorizedTransferPin] = useState('');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const [transactions, setTransactions] = useState<any[]>([]);

  const [balance, setBalance] = useState(() => {
    const saved = localStorage.getItem('bank_balance');
    return saved ? Number(saved) : currentUser.balance;
  });

  const [transferCount, setTransferCount] = useState(() => {
    const saved = localStorage.getItem('bank_transfer_count');
    return saved ? Number(saved) : 0;
  });

  const [lastTransfer, setLastTransfer] = useState<{ amount: number; recipientName: string; bankName: string; accountNumber: string; transferId?: string; awaitingClearance?: boolean } | null>(null);
  const [requestedClearanceTransferId, setRequestedClearanceTransferId] = useState('');
  const [pendingTransfer, setPendingTransfer] = useState<{
    txnId: string;
    amount: number;
    recipientName: string;
    bankName: string;
    accountNumber: string;
    description: string;
    transferType: 'INTERNAL' | 'EXTERNAL';
  } | null>(null);

  // Sync state changes to localStorage

  useEffect(() => {
    localStorage.setItem('bank_balance', balance.toString());
  }, [balance]);

  useEffect(() => {
    localStorage.setItem('bank_transfer_count', transferCount.toString());
  }, [transferCount]);

  const formatUserCurrency = useCallback((amount: number) => {
    const currency = currentUser.preferredCurrency || currentUser.preferred_currency || 'USD';
    try {
      return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
        style: 'currency',
        currency: currency
      }).format(amount);
    } catch (e) {
      return `${currency} ${amount.toLocaleString()}`;
    }
  }, [currentUser.preferredCurrency, currentUser.preferred_currency, lang]);

  const getCurrencySymbol = useCallback(() => {
    const currency = currentUser.preferredCurrency || currentUser.preferred_currency || 'USD';
    const symbols: Record<string, string> = {
      USD: '$', GBP: '£', EUR: '€', NGN: '₦', CAD: '$', AUD: '$', AED: 'د.إ'
    };
    return symbols[currency] || '$';
  }, [currentUser.preferredCurrency, currentUser.preferred_currency]);

  // Synchronize state with backend API
  const syncUserData = useCallback(() => {
    const token = getAuthToken();
    if (!token) return;

    // 1. Fetch user values (balance, transfer count)
    fetch('/api/v1/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (res.status === 401) {
          clearStoredSession();
          setIsLoggedIn(false);
          setCurrentUser(USER_DATA);
          setBalance(USER_DATA.balance);
          setTransactions([]);
          setTransferCount(0);
          throw new Error("Session does not belong to the active local database");
        }
        if (!res.ok) throw new Error("Database fetch error");
        return res.json();
      })
      .then(resData => {
        const data = resData.data;
        if (data) {
          setBalance(data.balance);
          setTransferCount(data.transfer_count || 0);
          setCurrentUser((prev: any) => {
            const updated = {
              ...prev,
              ...data,
              firstName: data.first_name,
              lastName: data.last_name,
              preferredCurrency: data.preferred_currency,
              transferPin: data.transfer_pin_set ? 'SET' : null,
              kycStatus: data.kyc_status,
              accountNumber: data.account_number,
              branchCode: data.branch_code
            };
         saveUser(updated);
            return updated;
          });
        }
      })
      .catch(err => {
        console.warn("Could not sync user from custom server:", err);
      });

    // 2. Fetch transaction history
    if (currentUser && currentUser.id) {
      Promise.all([
        fetch(`/api/v1/transactions/user/${currentUser.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/v1/transfers', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ])
        .then(async ([transactionResponse, transferResponse]) => {
          if (!transactionResponse.ok || !transferResponse.ok) throw new Error("Database fetch error");
          return Promise.all([transactionResponse.json(), transferResponse.json()]);
        })
        .then(([resData, transferPayload]) => {
          const data = resData.data;
          const transferRows = Array.isArray(transferPayload.data) ? transferPayload.data : [];
          const transfersById = new Map(transferRows.map((transfer: any) => [String(transfer.id), transfer]));
          if (Array.isArray(data)) {
            const mappedTxns = data.map((t: any) => {
              const transferId = String(t.reference || '').match(/^TXN-TRF-(\d+)-/)?.[1] || '';
              const transfer = transfersById.get(transferId) as any;
              return ({
              id: `TXN-${t.id}`,
              reference: t.reference,
              name: formatTransactionDescription(t.description),
              date: t.transaction_date
                ? String(t.transaction_date).split('T')[0].split(' ')[0]
                : t.created_at
                ? String(t.created_at).split('T')[0].split(' ')[0]
                : new Date().toISOString().split('T')[0],

              time: (t.transaction_date || t.created_at)
                ? (
                  String(t.transaction_date || t.created_at).includes('T')
                    ? String(t.transaction_date || t.created_at).split('T')[1]?.substring(0, 5)
                    : String(t.transaction_date || t.created_at).split(' ')[1]?.substring(0, 5)
                ) || '00:00'
                : '00:00',

              amount: t.amount,
              type: t.type ? t.type.toLowerCase() : 'debit',
              status: t.status === 'COMPLETED' ? 'Completed' : (t.status === 'PENDING' ? 'Pending' : 'Declined'),
              category: formatTransactionCategory(t.category),
              accountId: t.account_id,
              performedBy: [t.performed_by_first_name, t.performed_by_last_name].filter(Boolean).join(' '),
              originName: t.origin_name || '',
              originBank: t.origin_bank || '',
              originAccountNumber: t.origin_account_number || '',
              currency: t.currency || currentUser.preferred_currency || 'USD',
              transferId,
              recipientName: transfer?.recipient_name || '',
              recipientBank: transfer?.recipient_bank || '',
              recipientAccountNumber: transfer?.recipient_account_number || '',
              clearanceFeeAmount: transfer?.clearance_fee_amount,
              clearanceStatus: transfer?.clearance_status || '',
              clearanceReceipt: transfer?.clearance_receipt || '',
              clearanceSubmittedAt: transfer?.clearance_submitted_at || ''
            });
            });
            console.log('MAPPED TRANSACTIONS:', mappedTxns);
            setTransactions(mappedTxns);
          }
        })
        .catch(err => {
          console.warn("Could not sync transactions from custom server:", err);
        });
    }
  }, [currentUser?.email, currentUser?.id, clearStoredSession]);

  useEffect(() => {
    if (!isLoggedIn) return;

    let lastRefreshAt = Date.now();
    syncUserData();

    const refreshAfterReturning = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshAt < 60_000) return;
      lastRefreshAt = Date.now();
      syncUserData();
    };

    document.addEventListener('visibilitychange', refreshAfterReturning);
    window.addEventListener('focus', refreshAfterReturning);
    window.addEventListener('online', refreshAfterReturning);

    return () => {
      document.removeEventListener('visibilitychange', refreshAfterReturning);
      window.removeEventListener('focus', refreshAfterReturning);
      window.removeEventListener('online', refreshAfterReturning);
    };
  }, [isLoggedIn, syncUserData]);

  useEffect(() => {
    if (!isLoggedIn || activeTab === 'notifications') return;
    const token = getAuthToken();
    const loadUnread = () => {
      if (document.visibilityState !== 'visible') return Promise.resolve();
      return fetch('/api/v1/notifications/unread-count', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(payload => setUnreadNotificationCount(Number(payload.data?.count || 0)))
      .catch(() => undefined);
    };
    loadUnread();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadUnread();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isLoggedIn, activeTab]);

  const handleViewNotifications = useCallback(async () => {
    setUnreadNotificationCount(0);

    const token = getAuthToken();
    try {
      const response = await fetch('/api/v1/notifications/read-all', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Could not acknowledge notifications');
    } catch (error) {
      console.warn('Could not persist notification acknowledgement:', error);
    } finally {
      setActiveTab('notifications');
    }
  }, []);

  const submitTransfer = useCallback(async (pin: string, verificationToken = '') => {
    if (!pendingTransfer || !currentUser) return;

    const token = getAuthToken();
    const response = await fetch('/api/v1/transfers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        transfer_type: pendingTransfer.transferType,
        recipient_account_number: pendingTransfer.accountNumber,
        recipient_name: pendingTransfer.recipientName,
        recipient_bank: pendingTransfer.bankName,
        amount: pendingTransfer.amount,
        description: pendingTransfer.description,
        pin,
        verification_token: verificationToken
      })
    });

    const resData = await response.json();
    if (!response.ok) {
      const errMsg = resData?.error?.message || resData?.error || 'Failed to authorize transfer.';
      if (errMsg.toLowerCase().includes('restrict') || errMsg.toLowerCase().includes('suspended')) {
        setIsTransferCodeModalOpen(false);
        setIsRestrictedModalOpen(true);
        return;
      }
      throw new Error(errMsg);
    }

    // Success! Store details for success modal display
    const createdTransfer = resData?.data || {};
    setLastTransfer({
      amount: pendingTransfer.amount,
      recipientName: pendingTransfer.recipientName,
      bankName: pendingTransfer.bankName,
      accountNumber: pendingTransfer.accountNumber,
      transferId: String(createdTransfer.id || ''),
      awaitingClearance: createdTransfer.clearance_status === 'AWAITING_PAYMENT'
    });

    // Refresh balance and transaction log
    syncUserData();

    setIsTransferCodeModalOpen(false);
    setIsTransferVerificationOpen(false);
    setAuthorizedTransferPin('');
    setIsSuccessModalOpen(true);
  }, [pendingTransfer, currentUser, syncUserData]);

  const handleVerifyTransferPin = useCallback(async (
    pin: string,
    onProgress?: (stage: 'pin' | 'account' | 'processing') => void
  ) => {
    const transferFlow = currentUser.transferFlow || currentUser.transfer_flow;
    const token = getAuthToken();
    const response = await fetch('/api/v1/transfer-verification/verify-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ pin })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'Invalid transfer PIN');

    onProgress?.('account');
    await new Promise(resolve => window.setTimeout(resolve, 700));
    onProgress?.('processing');
    await new Promise(resolve => window.setTimeout(resolve, 700));

    if (transferFlow === 'RESTRICTED') {
      setIsTransferCodeModalOpen(false);
      setIsRestrictedModalOpen(true);
      return;
    }

    if (transferFlow !== 'AUTHORIZATION_REQUIRED') {
      await submitTransfer(pin);
      return;
    }

    setAuthorizedTransferPin(pin);
    setIsTransferCodeModalOpen(false);
    setIsTransferVerificationOpen(true);
  }, [currentUser, submitTransfer]);


  const saveUser = (user) => {
    const cleanUser = { ...user };

    delete cleanUser.id_front_image;
    delete cleanUser.id_back_image;

    updateStoredAuthUser(JSON.stringify(cleanUser));
  };
  
  
  const handleUserLogin = (userProfile: any, token: string, keepSignedIn: boolean) => {
    const {
  id_front_image,
  id_back_image,
  ...cleanUserProfile
} = userProfile;

const mappedUser = {
  ...cleanUserProfile,
  firstName: cleanUserProfile.first_name || cleanUserProfile.firstName,
  lastName: cleanUserProfile.last_name || cleanUserProfile.lastName,
  preferredCurrency: cleanUserProfile.preferred_currency || cleanUserProfile.preferredCurrency,
  preferredLanguage: cleanUserProfile.preferred_language || cleanUserProfile.preferredLanguage || 'en',
  transferPin: cleanUserProfile.transfer_pin_set
    ? 'SET'
    : (cleanUserProfile.transferPin || null),
  kycStatus: cleanUserProfile.kyc_status || cleanUserProfile.kycStatus,
  accountNumber: cleanUserProfile.account_number || cleanUserProfile.accountNumber,
  branchCode: cleanUserProfile.branch_code || cleanUserProfile.branchCode
};
Object.keys(userProfile).forEach(key => {
  const size = JSON.stringify(userProfile[key] || '').length;
  console.log(key, size);
});
    
  const userString = JSON.stringify(mappedUser);

console.log('auth_user size:', userString.length);
console.log('mappedUser:', mappedUser);

storeAuthSession(token, userString, keepSignedIn);

const preferredLanguage = normalizeLanguageCode(mappedUser.preferredLanguage || mappedUser.preferred_language) || 'en';
setLang(preferredLanguage);
localStorage.setItem('app_lang', preferredLanguage);

setCurrentUser(mappedUser);
setBalance(mappedUser.balance);
setTransferCount(mappedUser.transfer_count || 0);
setIsLoggedIn(true);
  };

  const handleLogout = () => {
    const token = getAuthToken();
    if (token) {
      fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => undefined);
    }
    clearStoredSession();
    setIsLoggedIn(false);
    setCurrentUser(USER_DATA);
    setBalance(USER_DATA.balance);
    setTransactions(TRANSACTIONS);
    setTransferCount(0);
    setActiveTab('dashboard');
  };

  if (!isLoggedIn) {
    return <>
      <LoginPage onLogin={handleUserLogin} lang={lang} onLanguageChange={handleLanguageChange} />
      <SupportWidget isAuthenticated={false} />
    </>;
  }

  const handleActionClick = (id: string) => {
    const routingMap: Record<string, string> = {
      'transfer': 'local-transfer',
      'local-transfer': 'local-transfer',
      'deposit': 'deposit',
      'history': 'history',
      'card': 'atm',
      'atm': 'atm',
      'account': 'details',
      'details': 'details',
      'stocks': 'stocks',
      'loans': 'loans',
    };

    if (id === 'logout') {
      handleLogout();
    } else if (routingMap[id]) {
      setActiveTab(routingMap[id]);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardOverview onActionClick={handleActionClick} balance={balance} transactions={transactions} user={currentUser} formatUserCurrency={formatUserCurrency} />;
      case 'deposit':
        return <DepositPage formatCurrency={formatUserCurrency} lang={lang} />;
      case 'joint-accounts':
        return <div className="max-w-5xl mx-auto py-4 md:py-8"><JointAccountsPanel currentUser={currentUser} onBalancesChanged={syncUserData} /></div>;
      case 'local-transfer':
        if (currentUser.transferPin === null || currentUser.transferPin === undefined || currentUser.transferPin === "") {
          return (
            <CreatePinPage
              userEmail={currentUser.email}
              onPinCreated={(newPin) => {
                setCurrentUser((prev: any) => {
                  const updated = { ...prev, transferPin: newPin };
                  saveUser(updated);
                  return updated;
                });
              }}
            />
          );
        }
        return (
          <TransferPage
            availableBalance={balance}
            currencySymbol={getCurrencySymbol()}
            formatUserCurrency={formatUserCurrency}
            lang={lang}
            onTransferSubmit={(data: any) => {
              setPendingTransfer({
                txnId: `TXN-${Math.floor(100000 + Math.random() * 900000)}`,
                amount: data.amount,
                recipientName: data.recipientName,
                bankName: data.bankName || 'Blue Crest Bank',
                accountNumber: data.accountNumber,
                description: data.description || 'Fund Transfer',
                transferType: data.transferType
              });
              setAuthorizedTransferPin('');
              setIsTransferCodeModalOpen(true);
            }}
          />
        );
      case 'kyc':
        return (
          <VerifyIdentityPage
            user={currentUser}
            lang={lang}
            onKycSubmitted={(newStatus) => {
              setCurrentUser((prev: any) => {
                const updated = { ...prev, kycStatus: newStatus };

delete updated.id_front_image;
delete updated.id_back_image;

saveUser(updated);
                return updated;
              });
            }}
          />
        );
      case 'loans':
        return (
          <LoansPage
            user={currentUser}
            onNavigateToTab={setActiveTab}
            lang={lang}
            formatUserCurrency={formatUserCurrency}
          />
        );
      case 'admin':
        return (
          <AdminPanel
            currentUser={currentUser}
            formatUserCurrency={formatUserCurrency}
          />
           );
          case 'pin':
        return (
          <SecurityPage
            user={currentUser}
            lang={lang}
            onPinUpdated={(newPin) => {
              setCurrentUser((prev: any) => {
                const updated = { ...prev, transferPin: newPin };

delete updated.id_front_image;
delete updated.id_back_image;

saveUser(updated);
return updated;
});
            }}
          />
        );
      case 'details':
        return (
          <ProfilePage
            currentUser={currentUser}
            onProfileUpdated={syncUserData}
            lang={lang}
          />
        );
      case 'notifications':
        return <NotificationsPage onNavigate={setActiveTab} onClose={() => setActiveTab('dashboard')} />;
      case 'support':
        return <div className="py-4 md:py-8"><SupportWidget embedded /></div>;
      case 'history':
        return <TransactionHistory transactions={transactions} formatCurrency={formatUserCurrency} onContactSupport={() => setActiveTab('support')} openClearanceTransferId={requestedClearanceTransferId} />;
      case 'summary':
        return <SummaryPage user={currentUser} balance={balance} />;
      case 'atm':
        return <CardsPage user={currentUser} formatCurrency={formatUserCurrency} />;
      case 'stocks':
        return <StocksPage />;
      default:
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-6 font-bold">
              ?
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Section Under Maintenance</h2>
            <p className="text-sm text-slate-500 max-w-xs">This feature is temporarily unavailable while we upgrade our systems.</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex bg-brand-light">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsSidebarOpen(false);
        }}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onLogout={handleLogout}
        lang={lang}
        user={currentUser}
      />

      <main className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <Header onMenuClick={() => setIsSidebarOpen(true)} onNotificationsClick={() => setActiveTab('notifications')} user={currentUser} lang={lang} />

        <div className="p-4 pb-32 md:p-8 md:pb-28 lg:pb-8 flex-1 overflow-y-auto">
          {String(currentUser.role || '').toUpperCase() !== 'ADMIN' && (
            <EmailVerificationBanner user={currentUser} onVerified={syncUserData} />
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <MobileBottomNav activeTab={activeTab} onNavigate={setActiveTab} />

      <RestrictedModal
        isOpen={isRestrictedModalOpen}
        onClose={() => setIsRestrictedModalOpen(false)}
      />
      <NotificationAlert count={activeTab === 'notifications' ? 0 : unreadNotificationCount} onView={handleViewNotifications} />
      {activeTab !== 'support' && <SupportWidget />}

      <TransferSuccessModal
        isOpen={isSuccessModalOpen}
        onClose={() => {
          setIsSuccessModalOpen(false);
          setActiveTab('dashboard');
        }}
        amount={lastTransfer?.amount || 0}
        recipientName={lastTransfer?.recipientName || ''}
        bankName={lastTransfer?.bankName || ''}
        accountNumber={lastTransfer?.accountNumber || ''}
        awaitingClearance={Boolean(lastTransfer?.awaitingClearance)}
        onClearance={() => {
          setIsSuccessModalOpen(false);
          setRequestedClearanceTransferId(lastTransfer?.transferId || '');
          setActiveTab('history');
          syncUserData();
        }}
        formatUserCurrency={formatUserCurrency}
      />

      <TransferCodeModal
        isOpen={isTransferCodeModalOpen}
        onClose={() => setIsTransferCodeModalOpen(false)}
        onVerify={handleVerifyTransferPin}
        amount={pendingTransfer?.amount || 0}
        userPin={currentUser.transferPin}
        formatUserCurrency={formatUserCurrency}
      />

      <TransferVerificationModal
        isOpen={isTransferVerificationOpen}
        holdMessage={currentUser.transfer_hold_message || currentUser.transferHoldMessage || ''}
        onContactSupport={() => {
          setIsTransferVerificationOpen(false);
          setAuthorizedTransferPin('');
          setPendingTransfer(null);
          setActiveTab('support');
        }}
        onClose={() => {
          setIsTransferVerificationOpen(false);
          setAuthorizedTransferPin('');
          setPendingTransfer(null);
        }}
        onVerified={async (token) => {
          await submitTransfer(authorizedTransferPin, token);
        }}
      />

      {(currentUser.role === 'ADMIN' || currentUser.role === 'Admin') && (
        <SandboxPanel
          user={currentUser}
          onRefreshUser={async () => {
            syncUserData();
          }}
          loans={[]}
        />
      )}
    </div>
  );
}

