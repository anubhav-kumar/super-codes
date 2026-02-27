defmodule LiveBettingWeb.WalletTransactionLive.Show do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Accounts

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Wallet transaction {@wallet_transaction.id}
        <:subtitle>This is a wallet_transaction record from your database.</:subtitle>
        <:actions>
          <.button navigate={~p"/wallet_transactions"}>
            <.icon name="hero-arrow-left" />
          </.button>
          <.button variant="primary" navigate={~p"/wallet_transactions/#{@wallet_transaction}/edit?return_to=show"}>
            <.icon name="hero-pencil-square" /> Edit wallet_transaction
          </.button>
        </:actions>
      </.header>

      <.list>
        <:item title="Type">{@wallet_transaction.type}</:item>
        <:item title="Amount">{@wallet_transaction.amount}</:item>
        <:item title="Balance after">{@wallet_transaction.balance_after}</:item>
      </.list>
    </Layouts.app>
    """
  end

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Show Wallet transaction")
     |> assign(:wallet_transaction, Accounts.get_wallet_transaction!(id))}
  end
end
