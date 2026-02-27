defmodule LiveBettingWeb.WalletTransactionLive.Index do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Accounts

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Listing Wallet transactions
        <:actions>
          <.button variant="primary" navigate={~p"/wallet_transactions/new"}>
            <.icon name="hero-plus" /> New Wallet transaction
          </.button>
        </:actions>
      </.header>

      <.table
        id="wallet_transactions"
        rows={@streams.wallet_transactions}
        row_click={fn {_id, wallet_transaction} -> JS.navigate(~p"/wallet_transactions/#{wallet_transaction}") end}
      >
        <:col :let={{_id, wallet_transaction}} label="Type">{wallet_transaction.type}</:col>
        <:col :let={{_id, wallet_transaction}} label="Amount">{wallet_transaction.amount}</:col>
        <:col :let={{_id, wallet_transaction}} label="Balance after">{wallet_transaction.balance_after}</:col>
        <:action :let={{_id, wallet_transaction}}>
          <div class="sr-only">
            <.link navigate={~p"/wallet_transactions/#{wallet_transaction}"}>Show</.link>
          </div>
          <.link navigate={~p"/wallet_transactions/#{wallet_transaction}/edit"}>Edit</.link>
        </:action>
        <:action :let={{id, wallet_transaction}}>
          <.link
            phx-click={JS.push("delete", value: %{id: wallet_transaction.id}) |> hide("##{id}")}
            data-confirm="Are you sure?"
          >
            Delete
          </.link>
        </:action>
      </.table>
    </Layouts.app>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Listing Wallet transactions")
     |> stream(:wallet_transactions, list_wallet_transactions())}
  end

  @impl true
  def handle_event("delete", %{"id" => id}, socket) do
    wallet_transaction = Accounts.get_wallet_transaction!(id)
    {:ok, _} = Accounts.delete_wallet_transaction(wallet_transaction)

    {:noreply, stream_delete(socket, :wallet_transactions, wallet_transaction)}
  end

  defp list_wallet_transactions() do
    Accounts.list_wallet_transactions()
  end
end
